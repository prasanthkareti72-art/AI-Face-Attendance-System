/**
 * AI & Face Recognition Module
 * Integrates face-api.js (tfjs-based) client-side face recognition
 */

class AIService {
    constructor() {
        this.modelUrl = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';
        this.isModelsLoaded = false;
        this.cameraStream = null;
        this.faceMatcher = null;
        this.similarityThreshold = 0.55; // Euclidean distance threshold (lower = stricter)
    }

    /**
     * Load required face-api.js models from CDN
     */
    async loadModels(onProgress = () => {}) {
        if (this.isModelsLoaded) return;

        try {
            onProgress("Loading Face Detector...");
            await faceapi.nets.ssdMobilenetv1.loadFromUri(this.modelUrl);
            
            onProgress("Loading Facial Landmark Detector...");
            await faceapi.nets.faceLandmark68Net.loadFromUri(this.modelUrl);
            
            onProgress("Loading Face Recognition Net...");
            await faceapi.nets.faceRecognitionNet.loadFromUri(this.modelUrl);

            this.isModelsLoaded = true;
            onProgress("AI Models loaded successfully!");
            console.log("All face-api.js models loaded.");
        } catch (error) {
            console.error("Error loading face-api.js models:", error);
            onProgress("Failed to load models. Check internet connection.");
            throw error;
        }
    }

    /**
     * Start the camera feed
     * @param {HTMLVideoElement} videoElement The video element to bind stream to
     * @param {string} facingMode 'user' for front camera, 'environment' for back camera
     */
    async startCamera(videoElement, facingMode = 'user') {
        this.stopCamera();

        const constraints = {
            video: {
                facingMode: facingMode,
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: false
        };

        try {
            this.cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
            videoElement.srcObject = this.cameraStream;
            await videoElement.play();
            return true;
        } catch (error) {
            console.error("Camera access failed:", error);
            // Fallback to simpler constraints
            try {
                this.cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
                videoElement.srcObject = this.cameraStream;
                await videoElement.play();
                return true;
            } catch (err2) {
                console.error("Fallback camera access also failed:", err2);
                throw new Error("Unable to access classroom camera. Please verify permissions.");
            }
        }
    }

    /**
     * Stop the active camera feed
     */
    stopCamera() {
        if (this.cameraStream) {
            this.cameraStream.getTracks().forEach(track => track.stop());
            this.cameraStream = null;
        }
    }

    /**
     * Capture single face during registration
     * Detects a face and returns the image (dataURL) and 128-dimensional descriptor
     */
    async captureSingleFace(inputElement) {
        if (!this.isModelsLoaded) throw new Error("Models not loaded yet.");

        // Detect face with landmarks and descriptor
        const detection = await faceapi.detectSingleFace(inputElement)
            .withFaceLandmarks()
            .withFaceDescriptor();

        if (!detection) {
            return null; // No face detected
        }

        // Generate a cropped image of the face for visual confirmation
        const box = detection.detection.box;
        const faceCanvas = document.createElement('canvas');
        const ctx = faceCanvas.getContext('2d');
        
        // Add a bit of padding around the crop box
        const pad = Math.min(box.width, box.height) * 0.15;
        const sx = Math.max(0, box.x - pad);
        const sy = Math.max(0, box.y - pad);
        const sw = Math.min(inputElement.width || inputElement.videoWidth || inputElement.naturalWidth, box.width + pad * 2);
        const sh = Math.min(inputElement.height || inputElement.videoHeight || inputElement.naturalHeight, box.height + pad * 2);
        
        faceCanvas.width = 150;
        faceCanvas.height = 150;
        
        ctx.drawImage(inputElement, sx, sy, sw, sh, 0, 0, 150, 150);
        const faceDataUrl = faceCanvas.toDataURL('image/jpeg');

        return {
            descriptor: detection.descriptor,
            faceImage: faceDataUrl,
            box: box
        };
    }

    /**
     * Update FaceMatcher with the registered students
     * @param {Array} students List of students from db
     */
    updateFaceMatcher(students) {
        const labeledDescriptors = [];

        students.forEach(student => {
            if (student.faceDescriptors && student.faceDescriptors.length > 0) {
                // Parse strings or Float32Arrays into faceapi.LabeledFaceDescriptors
                const descriptors = student.faceDescriptors.map(d => {
                    return d instanceof Float32Array ? d : new Float32Array(d);
                });
                
                labeledDescriptors.push(
                    new faceapi.LabeledFaceDescriptors(student.studentId, descriptors)
                );
            }
        });

        if (labeledDescriptors.length > 0) {
            this.faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, this.similarityThreshold);
            console.log(`FaceMatcher updated with ${labeledDescriptors.length} students.`);
            return true;
        } else {
            this.faceMatcher = null;
            console.warn("No registered students with face data found. Cannot initialize matcher.");
            return false;
        }
    }

    /**
     * Process Classroom Image for Attendance
     * Detects all faces, matches them against registered students, and outputs match details
     * @param {HTMLImageElement|HTMLVideoElement|HTMLCanvasElement} inputElement Classroom image source
     * @param {HTMLCanvasElement} overlayCanvas Optional canvas to draw bounding boxes on
     * @param {Array} allStudents List of students to match against
     */
    async scanAttendance(inputElement, overlayCanvas, allStudents) {
        if (!this.isModelsLoaded) throw new Error("Models not loaded yet.");

        // 1. Detect all faces, landmarks, and descriptors
        const detections = await faceapi.detectAllFaces(inputElement)
            .withFaceLandmarks()
            .withFaceDescriptors();

        // 2. Clear and resize canvas overlay if provided
        if (overlayCanvas) {
            const displaySize = {
                width: inputElement.videoWidth || inputElement.naturalWidth || inputElement.width,
                height: inputElement.videoHeight || inputElement.naturalHeight || inputElement.height
            };
            faceapi.matchDimensions(overlayCanvas, displaySize);
            const resizedDetections = faceapi.resizeResults(detections, displaySize);
            
            const ctx = overlayCanvas.getContext('2d');
            ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
            
            // Map student ID to names for easy lookup
            const studentMap = {};
            allStudents.forEach(s => {
                studentMap[s.studentId] = s.name;
            });

            const results = [];
            const detectedStudentIds = new Set();

            // 3. Match each detected face
            resizedDetections.forEach((detection, index) => {
                const descriptor = detections[index].descriptor;
                let matchResult = { label: 'unknown', distance: 1.0 };

                if (this.faceMatcher) {
                    const match = this.faceMatcher.findBestMatch(descriptor);
                    matchResult = {
                        label: match.label,
                        distance: match.distance
                    };
                }

                const studentId = matchResult.label;
                const isMatched = studentId !== 'unknown';
                const studentName = isMatched ? (studentMap[studentId] || 'Student') : 'Unknown Person';

                // Add to list of results
                results.push({
                    box: detection.detection.box,
                    studentId: isMatched ? studentId : null,
                    studentName: studentName,
                    distance: matchResult.distance,
                    isMatched: isMatched
                });

                if (isMatched) {
                    detectedStudentIds.add(studentId);
                }

                // Draw bounding boxes on canvas
                const drawBoxObj = new faceapi.draw.DrawBox(detection.detection.box, {
                    label: isMatched ? `${studentName} (${Math.round((1 - matchResult.distance) * 100)}% match)` : 'Unknown',
                    boxColor: isMatched ? '#10b981' : '#ef4444',
                    lineWidth: 3,
                    drawLabelOptions: {
                        anchorPosition: 'TOP_LEFT',
                        backgroundColor: isMatched ? '#10b981' : '#ef4444',
                        fontColor: '#ffffff',
                        fontSize: 14
                    }
                });
                drawBoxObj.draw(overlayCanvas);
                
                // Draw face landmarks (subtle dots in light green)
                faceapi.draw.drawFaceLandmarks(overlayCanvas, detection, {
                    color: isMatched ? '#34d399' : '#f87171',
                    lineWidth: 1
                });
            });

            return {
                detectedCount: detections.length,
                matchedStudentIds: Array.from(detectedStudentIds),
                results: results
            };
        }

        // If no canvas overlay is passed
        const matchedStudentIds = new Set();
        detections.forEach(det => {
            if (this.faceMatcher) {
                const match = this.faceMatcher.findBestMatch(det.descriptor);
                if (match.label !== 'unknown') {
                    matchedStudentIds.add(match.label);
                }
            }
        });

        return {
            detectedCount: detections.length,
            matchedStudentIds: Array.from(matchedStudentIds),
            results: []
        };
    }
}

// Instantiate and expose globally
const ai = new AIService();
window.ai = ai;
