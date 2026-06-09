/**
 * Main Application Controller
 * Handles routing, user interaction, camera views, and forms bindings
 */

class ApplicationController {
    constructor() {
        this.activeView = 'login';
        this.activeSubtab = 'students';
        
        // Face captures state during student registration
        this.currentRegImages = [];
        this.currentRegDescriptors = [];
        this.regFacingMode = 'user';
        this.regVideoElement = null;

        // Attendance capture state
        this.scannerFacingMode = 'environment';
        this.scannerVideoElement = null;
        this.scannerOverlayCanvas = null;
        this.scannerResults = [];
        this.scannedClassRecords = [];
        this.activeSubjectCode = null;
        this.activeClassSection = null;
        
        // Cache data lists
        this.cachedStudents = [];
        this.cachedSubjects = [];
    }

    /**
     * Start the application lifecycle
     */
    async start() {
        this.bindDOMReferences();
        this.bindEvents();
        
        // Show loading screen and load DB & AI models
        this.showLoading(true, "Initializing application database...");
        try {
            await window.db.init();
            
            // Try to load models in the background
            this.showLoading(true, "Loading AI Face Detection & Recognition models...\n(Typically 15-20MB CDN download. Cached after first load)");
            await window.ai.loadModels((progressMsg) => {
                this.updateLoadingText(progressMsg);
            });
            
            this.showLoading(false);
            this.showToast("Welcome! System initialized.", "success");
        } catch (e) {
            console.error("Initialization error:", e);
            this.showLoading(false);
            this.showToast("Local initialization finished. AI features offline.", "error");
        }

        // Initialize theme from local storage
        if (localStorage.getItem('dark_theme') === 'true') {
            document.body.classList.add('dark-theme');
            this.themeToggleBtn.innerHTML = '<i class="fa-solid fa-sun"></i>';
        }

        // Update settings UI based on database state
        this.updateSettingsUI();

        // Check if teacher is authenticated
        const currentTeacher = window.db.getCurrentTeacher();
        if (currentTeacher) {
            this.navigate('dashboard');
        } else {
            this.navigate('login');
        }
    }

    /**
     * Map all HTML elements to class members
     */
    bindDOMReferences() {
        // Core Shell
        this.appHeader = document.getElementById('app-header');
        this.bottomNav = document.getElementById('app-bottom-nav');
        this.loadingOverlay = document.getElementById('loading-overlay');
        this.loadingText = document.getElementById('loading-text');
        this.toastNotification = document.getElementById('toast-notification');
        this.toastMessage = document.getElementById('toast-message');
        this.toastIcon = document.getElementById('toast-icon');
        
        // Theme & Logout
        this.themeToggleBtn = document.getElementById('theme-toggle-btn');
        this.logoutBtn = document.getElementById('logout-btn');

        // Views
        this.views = {
            login: document.getElementById('view-login'),
            signup: document.getElementById('view-signup'),
            dashboard: document.getElementById('view-dashboard'),
            management: document.getElementById('view-management'),
            scanner: document.getElementById('view-scanner'),
            reports: document.getElementById('view-reports'),
            settings: document.getElementById('view-settings')
        };

        // Navigation Menu Buttons
        this.navItems = {
            dashboard: document.getElementById('nav-dashboard'),
            scanner: document.getElementById('nav-scanner'),
            management: document.getElementById('nav-management'),
            reports: document.getElementById('nav-reports'),
            settings: document.getElementById('nav-settings')
        };

        // Subtabs (Roster vs Subjects)
        this.subtabBtnStudents = document.getElementById('subtab-btn-students');
        this.subtabBtnSubjects = document.getElementById('subtab-btn-subjects');
        this.panelStudentsRoster = document.getElementById('panel-students-roster');
        this.panelSubjectsRoster = document.getElementById('panel-subjects-roster');

        // Auth Forms
        this.loginForm = document.getElementById('login-form');
        this.signupForm = document.getElementById('signup-form');
        this.switchToSignup = document.getElementById('switch-to-signup');
        this.switchToLogin = document.getElementById('switch-to-login');
        
        // Dashboard details
        this.dashSchoolName = document.getElementById('dashboard-school-name');
        this.dashTeacherName = document.getElementById('dashboard-teacher-name');
        this.dashCountStudents = document.getElementById('dash-count-students');
        this.dashCountSubjects = document.getElementById('dash-count-subjects');
        this.dashCountPresent = document.getElementById('dash-count-present');
        this.dashCountAbsent = document.getElementById('dash-count-absent');
        this.dashProgressBar = document.getElementById('dash-progress-bar');
        this.dashProgressText = document.getElementById('dash-progress-text');
        this.dashRecentActivity = document.getElementById('dashboard-recent-activity');
        this.btnQuickScan = document.getElementById('btn-quick-scan');

        // School Database panels
        this.studentsContainer = document.getElementById('students-list-container');
        this.subjectsContainer = document.getElementById('subjects-list-container');
        this.searchStudentsInput = document.getElementById('search-students-input');
        
        // Student Modal Registration elements
        this.studentModal = document.getElementById('student-modal');
        this.btnOpenStudentModal = document.getElementById('btn-open-student-modal');
        this.btnCloseStudentModal = document.getElementById('btn-close-student-modal');
        this.studentRegisterForm = document.getElementById('student-register-form');
        this.regThumbnailsList = document.getElementById('reg-thumbnails-list');
        this.regBtnCapture = document.getElementById('reg-btn-capture');
        this.regBtnFlip = document.getElementById('reg-btn-flip');
        this.regBtnToggleCamera = document.getElementById('reg-btn-toggle-camera');
        
        // Subject Modal elements
        this.subjectModal = document.getElementById('subject-modal');
        this.btnOpenSubjectModal = document.getElementById('btn-open-subject-modal');
        this.btnCloseSubjectModal = document.getElementById('btn-close-subject-modal');
        this.subjectRegisterForm = document.getElementById('subject-register-form');

        // AI Scanner View Elements
        this.scannerSelectSubject = document.getElementById('scanner-select-subject');
        this.scannerSelectClass = document.getElementById('scanner-select-class');
        this.scannerVideoElement = document.getElementById('scanner-video-element');
        this.scannerOverlayCanvas = document.getElementById('scanner-overlay-canvas');
        this.scannerBtnFlip = document.getElementById('scanner-btn-flip');
        this.scannerBtnCapture = document.getElementById('scanner-btn-capture');
        this.scannerBtnReset = document.getElementById('scanner-btn-reset');
        this.scannerResultsContainer = document.getElementById('scanner-results-container');
        this.scannerStatDetected = document.getElementById('scanner-stat-detected');
        this.scannerStatMatched = document.getElementById('scanner-stat-matched');
        this.btnSaveAttendance = document.getElementById('btn-save-attendance');

        // Reports View Elements
        this.reportFilterType = document.getElementById('report-filter-type');
        this.reportFilterSubject = document.getElementById('report-filter-subject');
        this.reportFilterDate = document.getElementById('report-filter-date');
        this.reportFilterMonth = document.getElementById('report-filter-month');
        this.reportDateGroup = document.getElementById('report-date-group');
        this.reportMonthGroup = document.getElementById('report-month-group');
        this.btnDownloadPdf = document.getElementById('btn-download-pdf');
        this.logsCountRecords = document.getElementById('logs-count-records');
        this.logsTableContainer = document.getElementById('logs-table-container');

        // Settings View Elements
        this.firebaseConfigForm = document.getElementById('firebase-config-form');
        this.btnClearFirebase = document.getElementById('btn-clear-firebase');
        this.btnResetAppDb = document.getElementById('btn-reset-app-db');
        this.profileTeacherName = document.getElementById('profile-teacher-name');
        this.profileEmployeeId = document.getElementById('profile-employee-id');
        this.profileSchoolName = document.getElementById('profile-school-name');
        this.profileMobileNumber = document.getElementById('profile-mobile-number');
        this.firebaseIndicator = document.getElementById('firebase-indicator');
        this.firebaseStatusText = document.getElementById('firebase-status-text');
        this.firebaseStatusDesc = document.getElementById('firebase-status-desc');
    }

    /**
     * Bind click and form submission events
     */
    bindEvents() {
        // Theme & Logout
        this.themeToggleBtn.addEventListener('click', () => this.toggleTheme());
        this.logoutBtn.addEventListener('click', () => this.handleLogout());

        // View Routing Click events
        Object.keys(this.navItems).forEach(viewName => {
            this.navItems[viewName].addEventListener('click', () => this.navigate(viewName));
        });

        // Auth Switch
        this.switchToSignup.addEventListener('click', (e) => { e.preventDefault(); this.navigate('signup'); });
        this.switchToLogin.addEventListener('click', (e) => { e.preventDefault(); this.navigate('login'); });

        // Auth Form Submissions
        this.loginForm.addEventListener('submit', (e) => this.handleLoginSubmit(e));
        this.signupForm.addEventListener('submit', (e) => this.handleSignupSubmit(e));

        // Subtabs switching
        this.subtabBtnStudents.addEventListener('click', () => this.switchSubtab('students'));
        this.subtabBtnSubjects.addEventListener('click', () => this.switchSubtab('subjects'));

        // Student Database List and Modals
        this.btnOpenStudentModal.addEventListener('click', () => this.openStudentModal());
        this.btnCloseStudentModal.addEventListener('click', () => this.closeStudentModal());
        this.studentRegisterForm.addEventListener('submit', (e) => this.handleStudentRegister(e));
        this.searchStudentsInput.addEventListener('input', () => this.renderStudentsRoster());

        // Student Face Capturing
        this.regBtnCapture.addEventListener('click', () => this.handleStudentFaceCapture());
        this.regBtnFlip.addEventListener('click', () => {
            this.regFacingMode = (this.regFacingMode === 'user') ? 'environment' : 'user';
            this.startRegistrationCamera();
        });
        this.regBtnToggleCamera.addEventListener('click', () => this.toggleRegistrationCamera());

        // Subject Modal Actions
        this.btnOpenSubjectModal.addEventListener('click', () => this.openSubjectModal());
        this.btnCloseSubjectModal.addEventListener('click', () => this.closeSubjectModal());
        this.subjectRegisterForm.addEventListener('submit', (e) => this.handleSubjectRegister(e));

        // AI Attendance Scanner Capture
        this.btnQuickScan.addEventListener('click', () => this.navigate('scanner'));
        this.scannerBtnFlip.addEventListener('click', () => {
            this.scannerFacingMode = (this.scannerFacingMode === 'user') ? 'environment' : 'user';
            this.startScannerCamera();
        });
        this.scannerBtnCapture.addEventListener('click', () => this.handleScannerCapture());
        this.scannerBtnReset.addEventListener('click', () => this.resetScannerCameraFeed());
        this.btnSaveAttendance.addEventListener('click', () => this.handleSaveAttendance());

        // Reports filtering and PDF export
        this.reportFilterType.addEventListener('change', () => this.toggleReportFilterInputs());
        this.reportFilterSubject.addEventListener('change', () => this.loadRosterAuditLogs());
        this.reportFilterDate.addEventListener('change', () => this.loadRosterAuditLogs());
        this.reportFilterMonth.addEventListener('change', () => this.loadRosterAuditLogs());
        this.btnDownloadPdf.addEventListener('click', () => this.handlePdfExport());

        // Settings actions
        this.firebaseConfigForm.addEventListener('submit', (e) => this.handleSaveFirebaseConfig(e));
        this.btnClearFirebase.addEventListener('click', () => this.handleClearFirebaseConfig());
        this.btnResetAppDb.addEventListener('click', () => this.handleResetDatabase());
    }

    // ==========================================
    // SHELL NAVIGATION & ROUTING
    // ==========================================

    /**
     * Switch view display block
     */
    navigate(viewName) {
        // Check Auth guard
        const isAuth = !!window.db.getCurrentTeacher();
        if (!isAuth && viewName !== 'login' && viewName !== 'signup') {
            viewName = 'login';
        }

        // De-active previous views and menus
        Object.keys(this.views).forEach(name => {
            this.views[name].classList.remove('active');
        });
        Object.keys(this.navItems).forEach(name => {
            this.navItems[name].classList.remove('active');
        });

        // Stop any camera feed running
        window.ai.stopCamera();
        
        // Hide sub-modals
        this.studentModal.style.display = 'none';
        this.subjectModal.style.display = 'none';

        // Activate requested
        this.activeView = viewName;
        this.views[viewName].classList.add('active');
        
        if (this.navItems[viewName]) {
            this.navItems[viewName].classList.add('active');
        }

        // Toggle shell headers & bottom menus visibility
        if (viewName === 'login' || viewName === 'signup') {
            this.appHeader.style.display = 'none';
            this.bottomNav.style.display = 'none';
        } else {
            this.appHeader.style.display = 'flex';
            this.bottomNav.style.display = 'flex';
            this.loadPageData(viewName);
        }
    }

    /**
     * Pull fresh database information for specific views
     */
    async loadPageData(viewName) {
        if (viewName === 'dashboard') {
            await this.loadDashboardData();
        } else if (viewName === 'management') {
            await this.loadDatabaseTab();
        } else if (viewName === 'scanner') {
            await this.loadScannerTab();
        } else if (viewName === 'reports') {
            await this.loadReportsTab();
        } else if (viewName === 'settings') {
            await this.loadSettingsTab();
        }
    }

    /**
     * Toggle management tabs
     */
    switchSubtab(tabName) {
        this.activeSubtab = tabName;
        if (tabName === 'students') {
            this.subtabBtnStudents.classList.add('active');
            this.subtabBtnSubjects.classList.remove('active');
            this.panelStudentsRoster.style.display = 'block';
            this.panelSubjectsRoster.style.display = 'none';
            this.renderStudentsRoster();
        } else {
            this.subtabBtnStudents.classList.remove('active');
            this.subtabBtnSubjects.classList.add('active');
            this.panelStudentsRoster.style.display = 'none';
            this.panelSubjectsRoster.style.display = 'block';
            this.renderSubjectsRoster();
        }
    }

    // ==========================================
    // THEME SWITCH
    // ==========================================

    toggleTheme() {
        document.body.classList.toggle('dark-theme');
        const isDark = document.body.classList.contains('dark-theme');
        localStorage.setItem('dark_theme', isDark);

        if (isDark) {
            this.themeToggleBtn.innerHTML = '<i class="fa-solid fa-sun"></i>';
        } else {
            this.themeToggleBtn.innerHTML = '<i class="fa-solid fa-moon"></i>';
        }
    }

    // ==========================================
    // MODULE 1: AUTHENTICATION
    // ==========================================

    async handleLoginSubmit(e) {
        e.preventDefault();
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;
        const remember = document.getElementById('login-remember').checked;

        this.showLoading(true, "Logging in teacher...");
        try {
            const teacher = await window.db.loginTeacher(email, password);
            this.showLoading(false);
            this.showToast(`Logged in as ${teacher.name}`, "success");
            
            // Clean forms
            this.loginForm.reset();
            
            // Navigate
            this.navigate('dashboard');
        } catch (error) {
            this.showLoading(false);
            this.showToast(error.message, "error");
        }
    }

    async handleSignupSubmit(e) {
        e.preventDefault();
        const name = document.getElementById('signup-name').value.trim();
        const employeeId = document.getElementById('signup-employee-id').value.trim();
        const email = document.getElementById('signup-email').value.trim();
        const mobile = document.getElementById('signup-mobile').value.trim();
        const schoolName = document.getElementById('signup-school').value.trim();
        const password = document.getElementById('signup-password').value;
        const confirmPassword = document.getElementById('signup-confirm-password').value;

        // Validations
        if (password.length < 6) {
            this.showToast("Password must be at least 6 characters.", "error");
            return;
        }

        if (password !== confirmPassword) {
            this.showToast("Passwords do not match.", "error");
            return;
        }

        this.showLoading(true, "Creating account...");
        try {
            await window.db.registerTeacher({
                name, employeeId, email, mobile, schoolName, password
            });
            
            this.showLoading(false);
            this.showToast("Teacher registered successfully! Please Login.", "success");
            
            this.signupForm.reset();
            this.navigate('login');
        } catch (error) {
            this.showLoading(false);
            this.showToast(error.message, "error");
        }
    }

    handleLogout() {
        if (confirm("Are you sure you want to sign out?")) {
            window.db.logoutTeacher();
            this.navigate('login');
            this.showToast("Signed out successfully.", "success");
        }
    }

    // ==========================================
    // MODULE 2: DASHBOARD VIEW
    // ==========================================

    async loadDashboardData() {
        const teacher = window.db.getCurrentTeacher();
        if (teacher) {
            this.dashSchoolName.innerText = teacher.schoolName;
            this.dashTeacherName.innerText = `Welcome Back, ${teacher.name}`;
        }

        // Query counts
        const students = await window.db.getStudents();
        const subjects = await window.db.getSubjects();
        
        this.cachedStudents = students;
        this.cachedSubjects = subjects;

        this.dashCountStudents.innerText = students.length;
        this.dashCountSubjects.innerText = subjects.length;

        // Calculate today's stats
        const todayStr = new Date().toISOString().split('T')[0];
        const todayAttendance = await window.db.getAttendance({ date: todayStr });

        const totalEnrolled = students.length;
        const presentCount = todayAttendance.filter(r => r.status === 'Present').length;
        const absentCount = todayAttendance.filter(r => r.status === 'Absent').length;
        
        this.dashCountPresent.innerText = presentCount;
        
        // Absent is total enrolled minus present, or counts explicitly marked absent
        const realAbsent = totalEnrolled > 0 ? (totalEnrolled - presentCount) : 0;
        this.dashCountAbsent.innerText = realAbsent;

        // Circular progress rate
        let rate = 0;
        if (totalEnrolled > 0) {
            rate = Math.round((presentCount / totalEnrolled) * 100);
        }
        
        this.dashProgressText.innerText = `${rate}%`;
        
        // Math formula for stroke-dashoffset: 188.4 is 2 * pi * r (r=30)
        const offset = 188.4 - (188.4 * rate / 100);
        this.dashProgressBar.style.strokeDashoffset = offset;

        // Recent scan feed
        this.renderRecentActivity(todayAttendance, subjects);
    }

    renderRecentActivity(todayAttendance, subjects) {
        this.dashRecentActivity.innerHTML = '';
        
        // Group attendance logs by subject code
        const subjectGroups = {};
        todayAttendance.forEach(rec => {
            if (!subjectGroups[rec.subjectCode]) {
                subjectGroups[rec.subjectCode] = [];
            }
            subjectGroups[rec.subjectCode].push(rec);
        });

        const subjectKeys = Object.keys(subjectGroups);
        if (subjectKeys.length === 0) {
            this.dashRecentActivity.innerHTML = `
                <div class="card" style="text-align: center; color: var(--text-muted); font-size: 13px; margin-bottom: 0;">
                    No attendance records logged today yet.
                </div>
            `;
            return;
        }

        subjectKeys.forEach(code => {
            const subject = subjects.find(s => s.code === code) || { name: code };
            const records = subjectGroups[code];
            const present = records.filter(r => r.status === 'Present').length;
            const total = records.length;
            
            // Get timestamp
            let timeStr = "Today";
            if (records[0] && records[0].timestamp) {
                const dateObj = new Date(records[0].timestamp);
                timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            }

            const item = document.createElement('div');
            item.className = 'activity-item';
            item.innerHTML = `
                <div class="activity-badge"><i class="fa-solid fa-clipboard-user"></i></div>
                <div class="activity-details">
                    <h5>${subject.name} - Class Attendance</h5>
                    <p>Scanned at ${timeStr} | ${present}/${total} students present</p>
                </div>
                <span class="badge badge-success" style="padding: 4px 6px; font-size: 9px;">Logged</span>
            `;
            this.dashRecentActivity.appendChild(item);
        });
    }

    // ==========================================
    // MODULE 3 & 4: DATABASE MANAGEMENT
    // ==========================================

    async loadDatabaseTab() {
        this.cachedStudents = await window.db.getStudents();
        this.cachedSubjects = await window.db.getSubjects();
        this.switchSubtab(this.activeSubtab);
    }

    renderStudentsRoster() {
        this.studentsContainer.innerHTML = '';
        const query = this.searchStudentsInput.value.toLowerCase().trim();
        
        const filtered = this.cachedStudents.filter(s => {
            return s.name.toLowerCase().includes(query) || 
                   s.rollNumber.toLowerCase().includes(query) ||
                   s.class.toLowerCase().includes(query);
        });

        if (filtered.length === 0) {
            this.studentsContainer.innerHTML = `
                <div class="card" style="text-align: center; color: var(--text-muted); font-size: 13px;">
                    No matching students found. Click the floating "+" to register one.
                </div>
            `;
            return;
        }

        // Sort by Roll Call
        filtered.sort((a,b) => parseInt(a.rollNumber) - parseInt(b.rollNumber));

        filtered.forEach(student => {
            const item = document.createElement('div');
            item.className = 'student-list-item';
            
            // Extract face thumbnail if registered
            const thumb = (student.faceImages && student.faceImages.length > 0) ? 
                student.faceImages[0] : 
                'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23cbd5e1"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>';

            item.innerHTML = `
                <div class="student-info">
                    <img src="${thumb}" class="student-avatar" alt="${student.name} photo">
                    <div class="student-meta">
                        <h4>${student.name} (Roll: ${student.rollNumber})</h4>
                        <p>Grade ${student.class}-${student.section} | Parents Mobile: ${student.parentMobile}</p>
                    </div>
                </div>
                <div class="student-actions">
                    <button class="action-btn delete" title="Delete Student" data-id="${student.studentId}">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            `;
            
            // Bind delete button
            item.querySelector('.delete').addEventListener('click', (e) => {
                e.stopPropagation();
                this.handleDeleteStudent(student.studentId, student.name);
            });

            this.studentsContainer.appendChild(item);
        });
    }

    async handleDeleteStudent(studentId, name) {
        if (confirm(`Are you sure you want to delete student "${name}"? This deletes their face records too.`)) {
            this.showLoading(true, "Deleting student...");
            try {
                await window.db.deleteStudent(studentId);
                this.showLoading(false);
                this.showToast("Student deleted.", "success");
                await this.loadDatabaseTab();
            } catch (err) {
                this.showLoading(false);
                this.showToast(err.message, "error");
            }
        }
    }

    renderSubjectsRoster() {
        this.subjectsContainer.innerHTML = '';
        if (this.cachedSubjects.length === 0) {
            this.subjectsContainer.innerHTML = `
                <div class="card" style="text-align: center; color: var(--text-muted); font-size: 13px;">
                    No subjects added yet. Click "Add New Subject" to begin.
                </div>
            `;
            return;
        }

        this.cachedSubjects.forEach(subject => {
            const card = document.createElement('div');
            card.className = 'card subject-card';
            card.innerHTML = `
                <div class="subject-details">
                    <h4>${subject.name}</h4>
                    <p>Code: ${subject.code} | Teacher: ${subject.teacherName}</p>
                </div>
                <button class="action-btn delete" title="Delete Subject" data-code="${subject.code}">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            `;
            
            // Delete subject bind
            card.querySelector('.delete').addEventListener('click', () => {
                this.handleDeleteSubject(subject.code, subject.name);
            });

            this.subjectsContainer.appendChild(card);
        });
    }

    async handleDeleteSubject(code, name) {
        if (confirm(`Delete subject "${name}"? Attendance histories will not be lost, but matching scans for this subject code will be updated.`)) {
            this.showLoading(true, "Deleting subject...");
            try {
                await window.db.deleteSubject(code);
                this.showLoading(false);
                this.showToast("Subject deleted.", "success");
                await this.loadDatabaseTab();
            } catch (err) {
                this.showLoading(false);
                this.showToast(err.message, "error");
            }
        }
    }

    // ==========================================
    // STUDENT REGISTRATION WITH LIVE CAMERA
    // ==========================================

    openStudentModal() {
        this.studentRegisterForm.reset();
        this.currentRegImages = [];
        this.currentRegDescriptors = [];
        this.regThumbnailsList.innerHTML = '';
        this.studentModal.style.display = 'block';
        
        // Auto select first options
        document.getElementById('std-class').selectedIndex = 0;
        document.getElementById('std-section').selectedIndex = 0;

        // Hook video
        this.regVideoElement = document.getElementById('register-video-element');
        this.startRegistrationCamera();
    }

    closeStudentModal() {
        this.studentModal.style.display = 'none';
        window.ai.stopCamera();
    }

    async startRegistrationCamera() {
        try {
            await window.ai.startCamera(this.regVideoElement, this.regFacingMode);
        } catch (e) {
            this.showToast(e.message, "error");
        }
    }

    toggleRegistrationCamera() {
        if (window.ai.cameraStream) {
            window.ai.stopCamera();
            this.regBtnToggleCamera.innerHTML = '<i class="fa-solid fa-video"></i>';
        } else {
            this.startRegistrationCamera();
            this.regBtnToggleCamera.innerHTML = '<i class="fa-solid fa-video-slash"></i>';
        }
    }

    async handleStudentFaceCapture() {
        if (!window.ai.cameraStream) {
            this.showToast("Please enable camera before capturing.", "error");
            return;
        }

        // Quick flash flash visual cue
        const wrapper = document.getElementById('register-camera-wrapper');
        wrapper.classList.add('flash-effect');
        setTimeout(() => wrapper.classList.remove('flash-effect'), 300);

        try {
            const captured = await window.ai.captureSingleFace(this.regVideoElement);
            if (!captured) {
                this.showToast("No face detected! Center your face and keep still.", "error");
                return;
            }

            // Save state
            this.currentRegImages.push(captured.faceImage);
            this.currentRegDescriptors.push(captured.descriptor);

            // Render thumbnail
            const index = this.currentRegImages.length - 1;
            const thumb = document.createElement('div');
            thumb.className = 'captured-face-thumb';
            thumb.innerHTML = `
                <img src="${captured.faceImage}" alt="crop face">
                <button type="button" class="delete-thumb-btn" data-index="${index}">&times;</button>
            `;
            
            // Delete capture event
            thumb.querySelector('.delete-thumb-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(e.target.dataset.index);
                this.currentRegImages.splice(idx, 1);
                this.currentRegDescriptors.splice(idx, 1);
                this.renderRegistrationThumbnails();
            });

            this.regThumbnailsList.appendChild(thumb);
            this.showToast(`Face capture template ${this.currentRegImages.length} saved.`, "success");

        } catch (err) {
            console.error(err);
            this.showToast("Face-API extraction error. Try again.", "error");
        }
    }

    renderRegistrationThumbnails() {
        this.regThumbnailsList.innerHTML = '';
        this.currentRegImages.forEach((imgSrc, index) => {
            const thumb = document.createElement('div');
            thumb.className = 'captured-face-thumb';
            thumb.innerHTML = `
                <img src="${imgSrc}" alt="crop face">
                <button type="button" class="delete-thumb-btn" data-index="${index}">&times;</button>
            `;
            
            thumb.querySelector('.delete-thumb-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(e.target.dataset.index);
                this.currentRegImages.splice(idx, 1);
                this.currentRegDescriptors.splice(idx, 1);
                this.renderRegistrationThumbnails();
            });

            this.regThumbnailsList.appendChild(thumb);
        });
    }

    async handleStudentRegister(e) {
        e.preventDefault();
        const name = document.getElementById('std-name').value.trim();
        const rollNumber = document.getElementById('std-roll').value.trim();
        const classGrade = document.getElementById('std-class').value;
        const section = document.getElementById('std-section').value;
        const parentMobile = document.getElementById('std-parent-mobile').value.trim();
        const email = document.getElementById('std-email').value.trim();

        if (this.currentRegImages.length === 0) {
            this.showToast("You must capture at least 1 face image template before saving.", "error");
            return;
        }

        // Validate roll number uniqueness inside grade section locally
        const dup = this.cachedStudents.find(s => s.class === classGrade && s.section === section && s.rollNumber === rollNumber);
        if (dup) {
            this.showToast(`Roll Number "${rollNumber}" already exists in Grade ${classGrade}-${section}!`, "error");
            return;
        }

        this.showLoading(true, "Registering student details & storing vectors...");
        try {
            await window.db.addStudent({
                name,
                rollNumber,
                class: classGrade,
                section,
                parentMobile,
                email,
                faceImages: this.currentRegImages,
                faceDescriptors: this.currentRegDescriptors
            });

            this.showLoading(false);
            this.showToast(`Student ${name} successfully registered.`, "success");
            this.closeStudentModal();
            await this.loadDatabaseTab();
        } catch (err) {
            this.showLoading(false);
            this.showToast(err.message, "error");
        }
    }

    // ==========================================
    // SUBJECT MODAL REGISTRATION
    // ==========================================

    openSubjectModal() {
        this.subjectRegisterForm.reset();
        this.subjectModal.style.display = 'block';
    }

    closeSubjectModal() {
        this.subjectModal.style.display = 'none';
    }

    async handleSubjectRegister(e) {
        e.preventDefault();
        const name = document.getElementById('subj-name').value.trim();
        const code = document.getElementById('subj-code').value.toUpperCase().trim();

        // Check duplicates
        if (this.cachedSubjects.find(s => s.code === code)) {
            this.showToast("A subject with this code already exists.", "error");
            return;
        }

        this.showLoading(true, "Creating subject...");
        try {
            await window.db.addSubject({ name, code });
            this.showLoading(false);
            this.showToast("Subject added successfully.", "success");
            this.closeSubjectModal();
            await this.loadDatabaseTab();
        } catch (err) {
            this.showLoading(false);
            this.showToast(err.message, "error");
        }
    }

    // ==========================================
    // MODULE 5: AI FACE ATTENDANCE SCANNER
    // ==========================================

    async loadScannerTab() {
        // Fetch subjects
        this.cachedSubjects = await window.db.getSubjects();
        this.cachedStudents = await window.db.getStudents();
        
        // Populate select list
        this.scannerSelectSubject.innerHTML = '<option value="">-- Choose Subject --</option>';
        this.cachedSubjects.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.code;
            opt.innerText = `${s.name} (${s.code})`;
            this.scannerSelectSubject.appendChild(opt);
        });

        this.scannerVideoElement = document.getElementById('scanner-video-element');
        this.scannerOverlayCanvas = document.getElementById('scanner-overlay-canvas');
        
        this.resetScannerState();
        this.startScannerCamera();
    }

    resetScannerState() {
        this.scannerResults = [];
        this.scannedClassRecords = [];
        this.btnSaveAttendance.disabled = true;
        this.scannerStatDetected.innerText = "Detected: 0 faces";
        this.scannerStatMatched.innerText = "Matched: 0 Students";
        this.scannerBtnReset.style.display = 'none';
        this.scannerBtnCapture.style.display = 'flex';
        document.getElementById('scanner-laser').style.display = 'block';
        
        // Clear canvas
        const ctx = this.scannerOverlayCanvas.getContext('2d');
        ctx.clearRect(0, 0, this.scannerOverlayCanvas.width, this.scannerOverlayCanvas.height);
        
        this.scannerResultsContainer.innerHTML = `
            <div style="text-align: center; color: var(--text-muted); font-size: 13px; padding: 10px;">
                Align classroom and press capture scan.
            </div>
        `;
    }

    async startScannerCamera() {
        try {
            await window.ai.startCamera(this.scannerVideoElement, this.scannerFacingMode);
        } catch (e) {
            this.showToast(e.message, "error");
        }
    }

    async handleScannerCapture() {
        const subCode = this.scannerSelectSubject.value;
        const classSection = this.scannerSelectClass.value;

        if (!subCode) {
            this.showToast("Please choose a subject first.", "warning");
            return;
        }

        if (!window.ai.cameraStream) {
            this.showToast("Camera feed is disabled. Reconnect camera.", "error");
            return;
        }

        // Check if there are students registered in database
        if (this.cachedStudents.length === 0) {
            this.showToast("No students are registered yet in database.", "warning");
            return;
        }

        // Initialize FaceMatcher with latest students
        const initialized = window.ai.updateFaceMatcher(this.cachedStudents);
        if (!initialized) {
            this.showToast("None of your registered students have face templates saved.", "warning");
        }

        this.showLoading(true, "Capturing snapshot & executing AI Face Matcher...");
        
        try {
            // Flash flash animation
            const scannerArea = document.getElementById('attendance-scanner-area');
            scannerArea.classList.add('flash-effect');
            setTimeout(() => scannerArea.classList.remove('flash-effect'), 300);

            // Pause video streams
            this.scannerVideoElement.pause();
            document.getElementById('scanner-laser').style.display = 'none';
            this.scannerBtnCapture.style.display = 'none';
            this.scannerBtnReset.style.display = 'flex';

            // Run processing
            const scanOutput = await window.ai.scanAttendance(
                this.scannerVideoElement,
                this.scannerOverlayCanvas,
                this.cachedStudents
            );

            this.showLoading(false);
            
            // Map grades & sections
            const grade = classSection.split('-')[0];
            const section = classSection.split('-')[1];

            // Filter roster of students currently enrolled in selected class & section
            const targetClassRoster = this.cachedStudents.filter(s => s.class === grade && s.section === section);
            
            if (targetClassRoster.length === 0) {
                this.showToast(`No registered students in Grade ${classSection}. Roster matches all database profiles.`, "info");
            }

            const rosterToLog = targetClassRoster.length > 0 ? targetClassRoster : this.cachedStudents;

            // Generate roster marking present/absent
            const matchedIds = scanOutput.matchedStudentIds;
            this.scannedClassRecords = rosterToLog.map(std => {
                const isPresent = matchedIds.includes(std.studentId);
                return {
                    studentId: std.studentId,
                    studentName: std.name,
                    rollNumber: std.rollNumber,
                    class: std.class,
                    section: std.section,
                    subjectCode: subCode,
                    date: new Date().toISOString().split('T')[0],
                    status: isPresent ? 'Present' : 'Absent',
                    timestamp: new Date().toISOString()
                };
            });

            // Update status panel counters
            this.scannerStatDetected.innerText = `Detected: ${scanOutput.detectedCount} faces`;
            this.scannerStatMatched.innerText = `Matched: ${matchedIds.length} Students`;

            // Draw identified list
            this.renderScannerRosterResults();
            this.btnSaveAttendance.disabled = false;

        } catch (err) {
            this.showLoading(false);
            console.error(err);
            this.showToast("Scanner failed to detect. Please retry.", "error");
            this.resetScannerCameraFeed();
        }
    }

    renderScannerRosterResults() {
        this.scannerResultsContainer.innerHTML = '';
        if (this.scannedClassRecords.length === 0) return;

        // Sort by Roll Call
        this.scannedClassRecords.sort((a,b) => parseInt(a.rollNumber) - parseInt(b.rollNumber));

        this.scannedClassRecords.forEach((record, index) => {
            const item = document.createElement('div');
            item.className = 'attendance-result-item';
            
            const badgeClass = record.status === 'Present' ? 'badge-success' : 'badge-danger';
            item.innerHTML = `
                <div>
                    <strong>Roll ${record.rollNumber}:</strong> ${record.studentName}
                </div>
                <div class="status-toggle badge ${badgeClass}" data-index="${index}">
                    ${record.status}
                </div>
            `;

            // Manual Override status onClick
            item.querySelector('.status-toggle').addEventListener('click', (e) => {
                const idx = parseInt(e.target.dataset.index);
                const rec = this.scannedClassRecords[idx];
                
                // Toggle status
                rec.status = (rec.status === 'Present') ? 'Absent' : 'Present';
                
                // Render update
                if (rec.status === 'Present') {
                    e.target.className = 'status-toggle badge badge-success';
                } else {
                    e.target.className = 'status-toggle badge badge-danger';
                }
                e.target.innerText = rec.status;
                
                // Recalculate match counters
                const matchedCount = this.scannedClassRecords.filter(r => r.status === 'Present').length;
                this.scannerStatMatched.innerText = `Matched: ${matchedCount} Students`;
            });

            this.scannerResultsContainer.appendChild(item);
        });
    }

    async resetScannerCameraFeed() {
        this.resetScannerState();
        try {
            this.scannerVideoElement.play();
        } catch(e) {}
    }

    async handleSaveAttendance() {
        if (this.scannedClassRecords.length === 0) return;
        
        this.showLoading(true, "Uploading classroom attendance data...");
        try {
            await window.db.saveAttendance(this.scannedClassRecords);
            this.showLoading(false);
            this.showToast("Attendance successfully saved!", "success");
            this.navigate('dashboard');
        } catch (err) {
            this.showLoading(false);
            this.showToast(err.message, "error");
        }
    }

    // ==========================================
    // MODULE 6 & 7: AUDIT LOGS & REPORTS PANEL
    // ==========================================

    async loadReportsTab() {
        this.cachedSubjects = await window.db.getSubjects();
        this.cachedStudents = await window.db.getStudents();
        
        // Populate subject dropdown
        this.reportFilterSubject.innerHTML = '';
        this.cachedSubjects.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.code;
            opt.innerText = `${s.name} (${s.code})`;
            this.reportFilterSubject.appendChild(opt);
        });

        // Set default dates
        const todayStr = new Date().toISOString().split('T')[0];
        const monthStr = todayStr.substring(0, 7); // YYYY-MM
        this.reportFilterDate.value = todayStr;
        this.reportFilterMonth.value = monthStr;

        this.toggleReportFilterInputs();
    }

    toggleReportFilterInputs() {
        const type = this.reportFilterType.value;
        if (type === 'daily') {
            this.reportDateGroup.style.display = 'block';
            this.reportMonthGroup.style.display = 'none';
        } else {
            this.reportDateGroup.style.display = 'none';
            this.reportMonthGroup.style.display = 'block';
        }
        this.loadRosterAuditLogs();
    }

    async loadRosterAuditLogs() {
        const type = this.reportFilterType.value;
        const subCode = this.reportFilterSubject.value;
        
        if (!subCode) {
            this.logsTableContainer.innerHTML = `
                <div style="text-align: center; color: var(--text-muted); font-size: 13px; padding: 20px;">
                    Select a subject to view logs.
                </div>
            `;
            this.logsCountRecords.innerText = '0 records';
            return;
        }

        let logs = [];
        if (type === 'daily') {
            const date = this.reportFilterDate.value;
            logs = await window.db.getAttendance({ date: date, subjectCode: subCode });
        } else {
            // Fetch all for this subject
            const allLogs = await window.db.getAttendance({ subjectCode: subCode });
            const month = this.reportFilterMonth.value; // YYYY-MM
            logs = allLogs.filter(r => r.date.startsWith(month));
        }

        this.logsCountRecords.innerText = `${logs.length} records`;
        this.renderAuditLogsTable(logs);
    }

    renderAuditLogsTable(logs) {
        this.logsTableContainer.innerHTML = '';
        if (logs.length === 0) {
            this.logsTableContainer.innerHTML = `
                <div style="text-align: center; color: var(--text-muted); font-size: 13px; padding: 20px;">
                    No records found matching filters.
                </div>
            `;
            return;
        }

        // Sort logs by Date, then by roll call
        logs.sort((a,b) => {
            if (a.date !== b.date) return a.date.localeCompare(b.date);
            return parseInt(a.rollNumber) - parseInt(b.rollNumber);
        });

        logs.forEach(record => {
            const row = document.createElement('div');
            row.className = 'attendance-table-row';
            
            const badgeClass = record.status === 'Present' ? 'badge-success' : 'badge-danger';
            
            row.innerHTML = `
                <div>
                    <strong>${record.studentName}</strong>
                    <div style="font-size: 9px; color: var(--text-muted);">${record.date}</div>
                </div>
                <div>#${record.rollNumber}</div>
                <div class="status-toggle badge ${badgeClass}" data-stdid="${record.studentId}" data-date="${record.date}">
                    ${record.status}
                </div>
            `;

            // Allow modifying logged record on click
            row.querySelector('.status-toggle').addEventListener('click', async (e) => {
                const stdId = e.target.dataset.stdid;
                const recDate = e.target.dataset.date;
                
                const rec = logs.find(r => r.studentId === stdId && r.date === recDate);
                if (rec) {
                    rec.status = (rec.status === 'Present') ? 'Absent' : 'Present';
                    
                    // Save to db
                    this.showLoading(true, "Updating database record...");
                    try {
                        await window.db.saveAttendance([rec]);
                        this.showLoading(false);
                        this.loadRosterAuditLogs(); // reload view
                    } catch(err) {
                        this.showLoading(false);
                        this.showToast(err.message, "error");
                    }
                }
            });

            this.logsTableContainer.appendChild(row);
        });
    }

    async handlePdfExport() {
        const type = this.reportFilterType.value;
        const subCode = this.reportFilterSubject.value;

        if (!subCode) {
            this.showToast("Select a subject code to export.", "warning");
            return;
        }

        const subjectObj = this.cachedSubjects.find(s => s.code === subCode);
        if (!subjectObj) return;

        this.showLoading(true, "Generating PDF layout...");

        try {
            if (type === 'daily') {
                const date = this.reportFilterDate.value;
                const records = await window.db.getAttendance({ date: date, subjectCode: subCode });
                
                if (records.length === 0) {
                    this.showToast("No attendance logs found for this date. Cannot generate empty PDF.", "warning");
                    this.showLoading(false);
                    return;
                }

                // Match with registered class roster
                const classGrade = records[0].class;
                const section = records[0].section;
                const classRoster = this.cachedStudents.filter(s => s.class === classGrade && s.section === section);
                const studentsToPrint = classRoster.length > 0 ? classRoster : this.cachedStudents;

                await window.reportService.generateDailyReport(date, subjectObj, records, studentsToPrint);
                this.showToast("Daily report PDF generated!", "success");
            } else {
                const month = this.reportFilterMonth.value; // YYYY-MM
                const allLogs = await window.db.getAttendance({ subjectCode: subCode });
                const monthlyRecords = allLogs.filter(r => r.date.startsWith(month));
                
                if (monthlyRecords.length === 0) {
                    this.showToast("No records found for selected month.", "warning");
                    this.showLoading(false);
                    return;
                }

                // Pull unique enrolled students in that class
                const classGrade = monthlyRecords[0].class;
                const section = monthlyRecords[0].section;
                const classRoster = this.cachedStudents.filter(s => s.class === classGrade && s.section === section);
                const studentsToPrint = classRoster.length > 0 ? classRoster : this.cachedStudents;

                await window.reportService.generateMonthlyReport(month, subjectObj, monthlyRecords, studentsToPrint);
                this.showToast("Monthly sheet PDF generated!", "success");
            }
            this.showLoading(false);
        } catch (err) {
            this.showLoading(false);
            console.error(err);
            this.showToast("Failed to compile PDF: " + err.message, "error");
        }
    }

    // ==========================================
    // MODULE 8: SYSTEM SETTINGS VIEW
    // ==========================================

    async loadSettingsTab() {
        const config = window.db.getFirebaseConfig();
        if (config) {
            document.getElementById('fb-api-key').value = config.apiKey || '';
            document.getElementById('fb-auth-domain').value = config.authDomain || '';
            document.getElementById('fb-project-id').value = config.projectId || '';
            document.getElementById('fb-storage-bucket').value = config.storageBucket || '';
            document.getElementById('fb-sender-id').value = config.messagingSenderId || '';
            document.getElementById('fb-app-id').value = config.appId || '';
        } else {
            this.firebaseConfigForm.reset();
        }

        // Bind profile cards
        const teacher = window.db.getCurrentTeacher();
        if (teacher) {
            this.profileTeacherName.innerText = teacher.name;
            this.profileEmployeeId.innerText = teacher.employeeId || 'N/A';
            this.profileSchoolName.innerText = teacher.schoolName || 'N/A';
            this.profileMobileNumber.innerText = teacher.mobile || 'N/A';
        }

        this.updateSettingsUI();
    }

    updateSettingsUI() {
        const isFb = window.db.isFirebaseEnabled();
        if (isFb) {
            this.firebaseIndicator.className = "firebase-status-indicator connected";
            this.firebaseStatusText.innerText = "Cloud Sync Active";
            this.firebaseStatusDesc.innerText = "Real-time Firebase Firestore syncing enabled.";
        } else {
            this.firebaseIndicator.className = "firebase-status-indicator";
            this.firebaseStatusText.innerText = "Local Offline Engine";
            this.firebaseStatusDesc.innerText = "All student & face details saved in IndexedDB.";
        }
    }

    async handleSaveFirebaseConfig(e) {
        e.preventDefault();
        const apiKey = document.getElementById('fb-api-key').value.trim();
        const authDomain = document.getElementById('fb-auth-domain').value.trim();
        const projectId = document.getElementById('fb-project-id').value.trim();
        const storageBucket = document.getElementById('fb-storage-bucket').value.trim();
        const messagingSenderId = document.getElementById('fb-sender-id').value.trim();
        const appId = document.getElementById('fb-app-id').value.trim();

        if (!apiKey || !projectId) {
            this.showToast("API Key and Project ID are required.", "warning");
            return;
        }

        const configObj = { apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId };

        this.showLoading(true, "Verifying Firebase authentication credentials...");
        
        // Save and attempt connection
        const success = window.db.saveFirebaseConfig(configObj);
        
        this.showLoading(false);
        if (success) {
            this.showToast("Connected to Firebase successfully!", "success");
            this.updateSettingsUI();
            this.navigate('dashboard');
        } else {
            this.showToast("Failed to initialize Firebase. Falling back to local db.", "error");
            this.updateSettingsUI();
        }
    }

    handleClearFirebaseConfig() {
        if (confirm("Disconnect from Firebase cloud server? The system will return to local IndexedDB mode.")) {
            window.db.saveFirebaseConfig(null);
            this.firebaseConfigForm.reset();
            this.updateSettingsUI();
            this.showToast("Disconnected from Firebase.", "info");
        }
    }

    async handleResetDatabase() {
        if (confirm("CRITICAL WARNING: This deletes all teachers, registered student face templates, subject codes, and history records from local IndexedDB storage. Do you wish to proceed?")) {
            this.showLoading(true, "Clearing database stores...");
            try {
                // Delete databases
                window.db.logoutTeacher();
                
                await new Promise((resolve, reject) => {
                    const req = indexedDB.deleteDatabase(window.db.dbName);
                    req.onsuccess = () => resolve();
                    req.onerror = () => reject(new Error("Could not delete DB."));
                });
                
                this.showLoading(false);
                alert("Application storage cleared. The app will reload.");
                window.location.reload();
            } catch(e) {
                this.showLoading(false);
                this.showToast(e.message, "error");
            }
        }
    }

    // ==========================================
    // NOTIFICATIONS & LOADING SPINNER
    // ==========================================

    showLoading(show, message = "Processing AI model weights...") {
        if (show) {
            this.loadingText.innerText = message;
            this.loadingOverlay.classList.add('active');
        } else {
            this.loadingOverlay.classList.remove('active');
        }
    }

    updateLoadingText(message) {
        this.loadingText.innerText = message;
    }

    showToast(message, type = "success") {
        this.toastMessage.innerText = message;
        this.toastNotification.className = `active ${type}`;
        
        if (type === 'success') {
            this.toastIcon.className = "fa-solid fa-circle-check";
        } else if (type === 'error') {
            this.toastIcon.className = "fa-solid fa-circle-xmark";
        } else {
            this.toastIcon.className = "fa-solid fa-circle-info";
        }

        // Slide out after 3 seconds
        clearTimeout(this.toastTimeout);
        this.toastTimeout = setTimeout(() => {
            this.toastNotification.classList.remove('active');
        }, 3500);
    }
}

// Bootstrap
document.addEventListener('DOMContentLoaded', () => {
    const app = new ApplicationController();
    window.app = app;
    app.start();
});
