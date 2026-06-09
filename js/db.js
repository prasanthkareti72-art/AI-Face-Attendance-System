/**
 * Database module for Automated Attendance System
 * Supports Dual-Mode: IndexedDB (Local Offline) & Firebase (Cloud Sync)
 */

class DatabaseService {
    constructor() {
        this.dbName = 'RuralAttendanceDB';
        this.dbVersion = 1;
        this.db = null;
        this.firebaseApp = null;
        this.firebaseDb = null;
        this.firebaseAuth = null;
        this.firebaseStorage = null;
        
        // Cache for current teacher
        this.currentTeacher = null;
    }

    /**
     * Initialize the database service
     */
    async init() {
        // 1. Initialize Local IndexedDB
        await this.initIndexedDB();
        
        // 2. Load Active Teacher from settings
        const teacherEmail = localStorage.getItem('current_teacher_email');
        if (teacherEmail) {
            this.currentTeacher = await this.getTeacherByEmail(teacherEmail);
        }

        // 3. Try to initialize Firebase if config is present
        const fbConfig = this.getFirebaseConfig();
        if (fbConfig && window.firebase) {
            try {
                this.initFirebase(fbConfig);
            } catch (err) {
                console.error("Firebase init failed, using local mode:", err);
            }
        }
    }

    /**
     * Initialize Local IndexedDB schema
     */
    initIndexedDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = (event) => {
                console.error("Database error: ", event.target.error);
                reject(event.target.error);
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Create teachers store
                if (!db.objectStoreNames.contains('teachers')) {
                    db.createObjectStore('teachers', { keyPath: 'email' });
                }

                // Create students store
                if (!db.objectStoreNames.contains('students')) {
                    db.createObjectStore('students', { keyPath: 'studentId' });
                }

                // Create subjects store
                if (!db.objectStoreNames.contains('subjects')) {
                    db.createObjectStore('subjects', { keyPath: 'code' });
                }

                // Create attendance store
                if (!db.objectStoreNames.contains('attendance')) {
                    const attendanceStore = db.createObjectStore('attendance', { keyPath: 'id', autoIncrement: true });
                    attendanceStore.createIndex('studentId', 'studentId', { unique: false });
                    attendanceStore.createIndex('subjectCode', 'subjectCode', { unique: false });
                    attendanceStore.createIndex('date', 'date', { unique: false });
                }
            };
        });
    }

    /**
     * Check if Firebase is active
     */
    isFirebaseEnabled() {
        return !!(this.firebaseApp && window.firebase);
    }

    /**
     * Initialize Firebase with provided config
     */
    initFirebase(config) {
        if (!window.firebase) {
            throw new Error("Firebase library not loaded.");
        }
        // Check if already initialized
        if (window.firebase.apps.length === 0) {
            this.firebaseApp = window.firebase.initializeApp(config);
        } else {
            this.firebaseApp = window.firebase.app();
        }
        this.firebaseDb = window.firebase.firestore();
        this.firebaseAuth = window.firebase.auth();
        this.firebaseStorage = window.firebase.storage();
        
        // Setup offline persistence for Firebase
        this.firebaseDb.enablePersistence().catch((err) => {
            if (err.code == 'failed-precondition') {
                console.warn("Multiple tabs open, Firebase persistence failed.");
            } else if (err.code == 'unimplemented') {
                console.warn("Browser does not support Firebase persistence.");
            }
        });
        
        console.log("Firebase initialized successfully");
    }

    /**
     * Save Firebase Config in localStorage
     */
    saveFirebaseConfig(config) {
        if (config) {
            localStorage.setItem('firebase_config', JSON.stringify(config));
            try {
                this.initFirebase(config);
                return true;
            } catch (err) {
                console.error("Failed to re-init Firebase with new config", err);
                return false;
            }
        } else {
            localStorage.removeItem('firebase_config');
            this.firebaseApp = null;
            this.firebaseDb = null;
            this.firebaseAuth = null;
            this.firebaseStorage = null;
            return true;
        }
    }

    /**
     * Get saved Firebase Config
     */
    getFirebaseConfig() {
        const configStr = localStorage.getItem('firebase_config');
        return configStr ? JSON.parse(configStr) : null;
    }

    // ==========================================
    // TEACHERS MODULE (AUTHENTICATION)
    // ==========================================

    async registerTeacher(teacherData) {
        if (this.isFirebaseEnabled()) {
            try {
                // 1. Firebase Auth Signup
                const userCredential = await this.firebaseAuth.createUserWithEmailAndPassword(
                    teacherData.email, 
                    teacherData.password
                );
                const uid = userCredential.user.uid;

                // 2. Save detailed info to Firestore
                const teacherObj = {
                    uid: uid,
                    name: teacherData.name,
                    employeeId: teacherData.employeeId,
                    email: teacherData.email,
                    mobile: teacherData.mobile,
                    schoolName: teacherData.schoolName,
                    createdAt: new Date().toISOString()
                };

                await this.firebaseDb.collection('teachers').doc(uid).set(teacherObj);
                
                // Store locally for sync & offline availability
                await this.writeLocal('teachers', teacherObj);
                return teacherObj;
            } catch (error) {
                console.error("Firebase registration error:", error);
                throw error;
            }
        } else {
            // Local Mode Registration
            const existing = await this.readLocal('teachers', teacherData.email);
            if (existing) {
                throw new Error("A teacher with this email is already registered.");
            }
            
            const teacherObj = {
                name: teacherData.name,
                employeeId: teacherData.employeeId,
                email: teacherData.email,
                mobile: teacherData.mobile,
                schoolName: teacherData.schoolName,
                password: teacherData.password, // Plain text ONLY for local sandbox mode
                createdAt: new Date().toISOString()
            };

            await this.writeLocal('teachers', teacherObj);
            return teacherObj;
        }
    }

    async loginTeacher(email, password) {
        if (this.isFirebaseEnabled()) {
            try {
                const userCredential = await this.firebaseAuth.signInWithEmailAndPassword(email, password);
                const uid = userCredential.user.uid;
                
                // Get doc
                const doc = await this.firebaseDb.collection('teachers').doc(uid).get();
                let teacherObj = doc.data();
                if (!teacherObj) {
                    // Fallback to local or generic
                    teacherObj = { email, uid, name: email.split('@')[0] };
                }
                
                // Save locally
                await this.writeLocal('teachers', teacherObj);
                this.currentTeacher = teacherObj;
                localStorage.setItem('current_teacher_email', email);
                return teacherObj;
            } catch (error) {
                console.error("Firebase Login error:", error);
                throw error;
            }
        } else {
            // Local Mode Login
            const teacher = await this.readLocal('teachers', email);
            if (!teacher || teacher.password !== password) {
                throw new Error("Invalid email or password.");
            }
            this.currentTeacher = teacher;
            localStorage.setItem('current_teacher_email', email);
            return teacher;
        }
    }

    async getTeacherByEmail(email) {
        return await this.readLocal('teachers', email);
    }

    getCurrentTeacher() {
        return this.currentTeacher;
    }

    logoutTeacher() {
        this.currentTeacher = null;
        localStorage.removeItem('current_teacher_email');
        if (this.isFirebaseEnabled()) {
            this.firebaseAuth.signOut().catch(console.error);
        }
    }

    // ==========================================
    // SUBJECT MANAGEMENT
    // ==========================================

    async addSubject(subjectData) {
        const subjectObj = {
            name: subjectData.name,
            code: subjectData.code,
            teacherName: this.currentTeacher ? this.currentTeacher.name : 'Unknown Teacher',
            createdAt: new Date().toISOString()
        };

        if (this.isFirebaseEnabled()) {
            await this.firebaseDb.collection('subjects').doc(subjectData.code).set(subjectObj);
        }
        await this.writeLocal('subjects', subjectObj);
        return subjectObj;
    }

    async getSubjects() {
        if (this.isFirebaseEnabled()) {
            try {
                const snapshot = await this.firebaseDb.collection('subjects').get();
                const subjects = [];
                snapshot.forEach(doc => subjects.push(doc.data()));
                
                // Sync to local
                for (const sub of subjects) {
                    await this.writeLocal('subjects', sub);
                }
                return subjects;
            } catch (e) {
                console.warn("Could not fetch online subjects, falling back to local:", e);
            }
        }
        return await this.getAllLocal('subjects');
    }

    async deleteSubject(code) {
        if (this.isFirebaseEnabled()) {
            await this.firebaseDb.collection('subjects').doc(code).delete();
        }
        await this.deleteLocal('subjects', code);
    }

    // ==========================================
    // STUDENT REGISTRATION (WITH FACE DATA)
    // ==========================================

    async addStudent(studentData) {
        // studentData contains: name, rollNumber, class, section, parentMobile, email, faceImages (Base64 arrays), faceDescriptors (Array of float arrays)
        const studentObj = {
            studentId: studentData.studentId || 'std_' + Date.now(),
            name: studentData.name,
            rollNumber: studentData.rollNumber,
            class: studentData.class,
            section: studentData.section,
            parentMobile: studentData.parentMobile,
            email: studentData.email || '',
            faceImages: studentData.faceImages || [], // Array of base64 images
            faceDescriptors: studentData.faceDescriptors || [], // Array of Float32Array or standard arrays
            createdAt: new Date().toISOString()
        };

        if (this.isFirebaseEnabled()) {
            // Upload Base64 images to Firebase Storage, get URLs
            const uploadedUrls = [];
            for (let i = 0; i < studentObj.faceImages.length; i++) {
                const imgBase64 = studentObj.faceImages[i];
                if (imgBase64.startsWith('data:')) {
                    try {
                        const path = `students/${studentObj.studentId}/face_${i}.jpg`;
                        const ref = this.firebaseStorage.ref().child(path);
                        const uploadTask = await ref.putString(imgBase64, 'data_url');
                        const downloadUrl = await uploadTask.ref.getDownloadURL();
                        uploadedUrls.push(downloadUrl);
                    } catch (err) {
                        console.error("Failed to upload face image to storage:", err);
                        uploadedUrls.push(imgBase64); // Fallback
                    }
                } else {
                    uploadedUrls.push(imgBase64);
                }
            }
            
            // Build doc payload
            const dbPayload = {
                ...studentObj,
                faceImages: uploadedUrls,
                // Firestore doesn't support Float32Array directly, convert to regular Array
                faceDescriptors: studentObj.faceDescriptors.map(d => Array.from(d))
            };

            await this.firebaseDb.collection('students').doc(studentObj.studentId).set(dbPayload);
            
            // Store back locally with cloud URLs
            await this.writeLocal('students', dbPayload);
            return dbPayload;
        } else {
            // Store locally (IndexedDB handles float arrays easily)
            await this.writeLocal('students', studentObj);
            return studentObj;
        }
    }

    async getStudents() {
        if (this.isFirebaseEnabled()) {
            try {
                const snapshot = await this.firebaseDb.collection('students').get();
                const students = [];
                snapshot.forEach(doc => {
                    const data = doc.data();
                    // Convert stored regular arrays back to Float32Array for face-api.js comparison
                    if (data.faceDescriptors) {
                        data.faceDescriptors = data.faceDescriptors.map(d => new Float32Array(d));
                    }
                    students.push(data);
                });
                
                // Sync to local
                for (const std of students) {
                    await this.writeLocal('students', std);
                }
                return students;
            } catch (e) {
                console.warn("Could not fetch online students, falling back to local:", e);
            }
        }
        
        const localStudents = await this.getAllLocal('students');
        // Convert local descriptor arrays back to Float32Array if needed
        return localStudents.map(std => {
            if (std.faceDescriptors) {
                std.faceDescriptors = std.faceDescriptors.map(d => d instanceof Float32Array ? d : new Float32Array(d));
            }
            return std;
        });
    }

    async deleteStudent(studentId) {
        if (this.isFirebaseEnabled()) {
            await this.firebaseDb.collection('students').doc(studentId).delete();
            // Optional: delete face images in Storage
            try {
                for (let i = 0; i < 5; i++) {
                    const path = `students/${studentId}/face_${i}.jpg`;
                    await this.firebaseStorage.ref().child(path).delete().catch(() => {});
                }
            } catch (e) {}
        }
        await this.deleteLocal('students', studentId);
    }

    // ==========================================
    // ATTENDANCE LOGS
    // ==========================================

    async saveAttendance(records) {
        // records is array of: { studentId, subjectCode, date, status, timestamp, studentName, rollNumber }
        const savePromises = records.map(async (rec) => {
            const attObj = {
                ...rec,
                timestamp: rec.timestamp || new Date().toISOString()
            };

            if (this.isFirebaseEnabled()) {
                // Firestore ID = studentId + "_" + subjectCode + "_" + date
                const docId = `${rec.studentId}_${rec.subjectCode}_${rec.date}`;
                await this.firebaseDb.collection('attendance').doc(docId).set(attObj);
            }
            
            // Save to IndexedDB
            await this.writeLocalAttendance(attObj);
        });

        await Promise.all(savePromises);
    }

    async getAttendance(filters = {}) {
        // Filters can include: date (YYYY-MM-DD), subjectCode, studentId
        let records = [];

        if (this.isFirebaseEnabled()) {
            try {
                let query = this.firebaseDb.collection('attendance');
                if (filters.date) query = query.where('date', '==', filters.date);
                if (filters.subjectCode) query = query.where('subjectCode', '==', filters.subjectCode);
                if (filters.studentId) query = query.where('studentId', '==', filters.studentId);
                
                const snapshot = await query.get();
                snapshot.forEach(doc => records.push(doc.data()));

                // Cache all to local
                for (const rec of records) {
                    await this.writeLocalAttendance(rec);
                }
                return records;
            } catch (e) {
                console.warn("Could not query Firebase attendance, querying local:", e);
            }
        }

        // Local Mode filtering
        records = await this.getAllLocal('attendance');
        if (filters.date) {
            records = records.filter(r => r.date === filters.date);
        }
        if (filters.subjectCode) {
            records = records.filter(r => r.subjectCode === filters.subjectCode);
        }
        if (filters.studentId) {
            records = records.filter(r => r.studentId === filters.studentId);
        }

        return records;
    }

    // ==========================================
    // INDEXEDDB UTILITIES
    // ==========================================

    writeLocal(storeName, item) {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject(new Error("Database not initialized."));
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put(item);
            request.onsuccess = () => resolve(item);
            request.onerror = (e) => reject(e.target.error);
        });
    }

    readLocal(storeName, key) {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject(new Error("Database not initialized."));
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = (e) => reject(e.target.error);
        });
    }

    deleteLocal(storeName, key) {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject(new Error("Database not initialized."));
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(key);
            request.onsuccess = () => resolve();
            request.onerror = (e) => reject(e.target.error);
        });
    }

    getAllLocal(storeName) {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject(new Error("Database not initialized."));
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = (e) => reject(e.target.error);
        });
    }

    writeLocalAttendance(record) {
        return new Promise(async (resolve, reject) => {
            if (!this.db) return reject(new Error("Database not initialized."));
            
            // Check if there is already a local record for this student/subject/date
            const transaction = this.db.transaction(['attendance'], 'readwrite');
            const store = transaction.objectStore('attendance');
            const index = store.index('studentId');
            
            const request = index.getAll(record.studentId);
            request.onsuccess = async () => {
                const results = request.result || [];
                const duplicate = results.find(r => r.subjectCode === record.subjectCode && r.date === record.date);
                
                if (duplicate) {
                    // Update instead of insert
                    record.id = duplicate.id;
                }
                
                const putTransaction = this.db.transaction(['attendance'], 'readwrite');
                const putStore = putTransaction.objectStore('attendance');
                const putRequest = putStore.put(record);
                putRequest.onsuccess = () => resolve(record);
                putRequest.onerror = (e) => reject(e.target.error);
            };
            request.onerror = (e) => reject(e.target.error);
        });
    }
}

// Instantiate and expose globally
const db = new DatabaseService();
window.db = db;
