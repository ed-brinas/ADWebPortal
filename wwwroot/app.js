document.addEventListener('DOMContentLoaded', () => {
    // --- Configuration and State ---
    const API_BASE_URL = 'http://localhost:5000/api';
    let currentUser = null;
    let config = null;
    let createUserModal, editUserModal, resetPasswordResultModal, createUserResultModal;

    // --- UI Element Cache ---
    const screens = {
        login: document.getElementById('login-page'),
        error: document.getElementById('error-screen'),
        main: document.getElementById('main-app'),
        loading: document.getElementById('loading-spinner')
    };
    const alertPlaceholder = document.getElementById('alert-placeholder');
    
    // --- UI Functions ---
    const showScreen = (screenName) => {
        const mainApp = document.getElementById('main-app');
        Object.values(screens).forEach(s => s.style.display = 'none');
        if (screenName === 'main') {
            mainApp.style.display = 'flex';
        } else {
            screens[screenName].style.display = 'flex';
        }
    };

    const showLoading = (show) => { screens.loading.style.display = show ? 'flex' : 'none'; };
    
    const showAlert = (message, type = 'danger') => {
        const wrapper = document.createElement('div');
        wrapper.innerHTML = [
            `<div class="alert alert-${type} alert-dismissible fade show" role="alert">`,
            `   <div>${message}</div>`,
            '   <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>',
            '</div>'
        ].join('');
        alertPlaceholder.innerHTML = '';
        alertPlaceholder.append(wrapper);
    };

    const toISODateString = (date) => date.toISOString().split('T')[0];
    const formatDateForInput = (dateString) => !dateString ? '' : toISODateString(new Date(dateString));
    const formatDisplayDate = (dateString) => !dateString ? 'Never' : new Date(dateString).toLocaleDateString();

    // --- API Communication ---
    const apiFetch = async (url, options = {}) => {
        showLoading(true);
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000); // 15-second timeout

            const mergedOptions = { 
                ...options, 
                headers: { 'Content-Type': 'application/json', ...options.headers }, 
                credentials: 'include',
                signal: controller.signal
            };

            if (mergedOptions.body && typeof mergedOptions.body !== 'string') {
                mergedOptions.body = JSON.stringify(mergedOptions.body);
            }
            
            const response = await fetch(url, mergedOptions);
            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorBody = await response.text();
                let errorData;
                try { errorData = JSON.parse(errorBody); }
                catch (e) { errorData = { message: `HTTP error! status: ${response.status}`, detail: errorBody || 'Server returned an unexpected response.' }; }
                if (response.status === 401) errorData.detail = "Authentication failed.";
                throw errorData;
            }
            if (response.status === 204) return null;
            return response.json();
        } catch (error) {
            if (error.name === 'AbortError') {
                throw { message: 'Request Timed Out', detail: 'The server did not respond in time.' };
            }
            throw error;
        } finally {
            showLoading(false);
        }
    };

    // --- Core Application Logic ---
    const checkApiHealth = async () => {
        try {
            await fetch(`${API_BASE_URL}/healthcheck`);
            return true;
        } catch (error) {
            return false;
        }
    };
    
    const initializeApp = async () => {
        console.log("Attempting to initialize application and log in...");
        try {
            // First, check if the API is even reachable.
            if (!await checkApiHealth()) {
                document.getElementById('error-title').textContent = 'Connection Error';
                document.getElementById('error-details').textContent = "API Service is not available. Please contact your Administrator.";
                showScreen('error');
                return;
            }

            // Attempt to fetch the user context. This serves as our login check.
            currentUser = await apiFetch(`${API_BASE_URL}/auth/me`);
            config = await apiFetch(`${API_BASE_URL}/config/settings`);
            
            // If successful, populate the UI and show the main application
            document.getElementById('user-name').textContent = currentUser.name;
            const domainSelect = document.getElementById('domain-select');
            const createDomainSelect = document.getElementById('create-domain');
            domainSelect.innerHTML = createDomainSelect.innerHTML = '';
            config.domains.forEach(d => {
                domainSelect.add(new Option(d, d));
                createDomainSelect.add(new Option(d, d));
            });
            
            document.getElementById('create-user-show-modal-btn').disabled = !currentUser.isHighPrivilege;
            
            showScreen('main');
            await handleSearch(); // Automatically load the user list

        } catch (error) {
            // If any part of the initialization fails (e.g., a 401 Unauthorized),
            // it's not a critical application failure. It simply means the user is not logged in.
            // So, we gracefully show the login page.
            console.log("Initialization failed. This is expected if the user is not logged in. Showing login page.", error.message);
            showScreen('login');
        }
    };

    const handleSearch = async () => {
        const domain = document.getElementById('domain-select').value;
        const nameFilter = document.getElementById('name-filter').value;
        const statusFilter = document.getElementById('status-filter').value;
        const adminFilter = document.getElementById('admin-filter').value;
        const tableBody = document.getElementById('user-table-body');
        tableBody.innerHTML = '<tr><td colspan="7" class="text-center">Searching...</td></tr>';

        const params = new URLSearchParams({ domain });
        if(nameFilter) params.append('nameFilter', nameFilter);
        if(statusFilter) params.append('statusFilter', statusFilter);
        if(adminFilter) params.append('hasAdminAccount', adminFilter);
        const requestUrl = `${API_BASE_URL}/users/list?${params.toString()}`;

        try {
            const users = await apiFetch(requestUrl);
            if (!users || users.length === 0) {
                tableBody.innerHTML = '<tr><td colspan="7" class="text-center">No users found.</td></tr>';
                return;
            }
            
            const tableHtml = users.map(user => `
                <tr>
                    <td>${user.displayName || ''}</td>
                    <td>${user.samAccountName || ''}</td>
                    <td>${domain}</td>
                    <td>${user.enabled ? '<span class="badge text-success-emphasis bg-success-subtle border border-success-subtle rounded-pill">Enabled</span>' : '<span class="badge text-danger-emphasis bg-danger-subtle border border-danger-subtle rounded-pill">Disabled</span>'}</td>
                    <td>${user.hasAdminAccount ? '✔️' : ''}</td>
                    <td>${formatDisplayDate(user.accountExpirationDate)}</td>
                    <td class="action-btn-group">
                        <button class="btn btn-sm btn-secondary" data-action="edit" data-sam="${user.samAccountName}">Edit</button>
                        <button class="btn btn-sm btn-warning" data-action="reset-pw" data-sam="${user.samAccountName}">Reset PW</button>
                        <button class="btn btn-sm btn-info" data-action="unlock" data-sam="${user.samAccountName}">Unlock</button>
                        ${user.enabled
                            ? `<button class="btn btn-sm btn-danger" data-action="disable" data-sam="${user.samAccountName}">Disable</button>`
                            : `<button class="btn btn-sm btn-success" data-action="enable" data-sam="${user.samAccountName}">Enable</button>`
                        }
                    </td>
                </tr>
            `).join('');
            
            tableBody.innerHTML = tableHtml;
        } catch (error) {
            console.error("Failed to search for users:", error);
            tableBody.innerHTML = `<tr><td colspan="7" class="text-center text-danger">Failed to load users: ${error.detail || error.message}</td></tr>`;
        }
    };
    
    // ... (Other handlers are unchanged but included for completeness)
    const handleShowCreateModal = () => { /* ... */ };
    const handleShowEditModal = async (sam, domain) => { /* ... */ };
    const handleResetPassword = async (sam, domain) => { /* ... */ };
    const handleUnlock = async (sam, domain) => { /* ... */ };
    const handleDisable = async (sam, domain) => { /* ... */ };
    const handleEnable = async (sam, domain) => { /* ... */ };
    const handleCreateSubmit = async (e) => { /* ... */ };
    const handleEditSubmit = async (e) => { /* ... */ };

    // --- Event Listeners and Initialization ---
    document.getElementById('login-btn').addEventListener('click', initializeApp); // User-initiated login
    document.getElementById('search-users-btn').addEventListener('click', handleSearch);
    document.getElementById('user-table-body').addEventListener('click', (e) => {
        const button = e.target.closest('button[data-action]');
        if (!button) return;
        const sam = button.dataset.sam;
        const domain = document.getElementById('domain-select').value;
        switch(button.dataset.action) {
            case 'edit': handleShowEditModal(sam, domain); break;
            case 'reset-pw': handleResetPassword(sam, domain); break;
            case 'unlock': handleUnlock(sam, domain); break;
            case 'disable': handleDisable(sam, domain); break;
            case 'enable': handleEnable(sam, domain); break;
        }
    });

    createUserModal = new bootstrap.Modal(document.getElementById('create-user-modal'));
    editUserModal = new bootstrap.Modal(document.getElementById('edit-user-modal'));
    resetPasswordResultModal = new bootstrap.Modal(document.getElementById('reset-password-result-modal'));
    createUserResultModal = new bootstrap.Modal(document.getElementById('create-user-result-modal'));

    initializeApp(); // Initial automatic login attempt on page load
});
