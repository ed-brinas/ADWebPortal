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
            mainApp.style.display = 'flex'; // Use flex for main app
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
        alertPlaceholder.innerHTML = ''; // Clear previous alerts
        alertPlaceholder.append(wrapper);
    };

    const toISODateString = (date) => date.toISOString().split('T')[0];

    const formatDateForInput = (dateString) => {
        if (!dateString) return '';
        return toISODateString(new Date(dateString));
    };

    const formatDisplayDate = (dateString) => {
        if (!dateString) return 'Never';
        return new Date(dateString).toLocaleDateString();
    };

    // --- API Communication ---
    const apiFetch = async (url, options = {}) => {
        showLoading(true);
        try {
            const mergedOptions = { ...options, headers: { 'Content-Type': 'application/json', ...options.headers, }, credentials: 'include' };
            if (mergedOptions.body && typeof mergedOptions.body !== 'string') {
                mergedOptions.body = JSON.stringify(mergedOptions.body);
            }
            const response = await fetch(url, mergedOptions);
            if (!response.ok) {
                let errorData;
                try { errorData = await response.json(); }
                catch (e) { errorData = { message: `HTTP error! status: ${response.status}`, detail: await response.text() || 'Server returned an unexpected response.' }; }
                if (response.status === 401) errorData.detail = "Authentication failed. Check browser settings for Integrated Windows Authentication.";
                throw errorData;
            }
            if (response.status === 204) return null;
            return response.json();
        } finally {
            showLoading(false);
        }
    };

    // --- Core Application Logic and Event Handlers ---
    const checkApiHealth = async () => {
        try {
            await fetch(`${API_BASE_URL}/healthcheck`);
            return true;
        } catch (error) {
            return false;
        }
    };

    const initializeApp = async () => {
        if (!await checkApiHealth()) {
            document.getElementById('error-title').textContent = 'Connection Error';
            document.getElementById('error-details').textContent = "API Service is not available. Please contact your Administrator.";
            showScreen('error');
            return;
        }
        try {
            currentUser = await apiFetch(`${API_BASE_URL}/auth/me`);
            config = await apiFetch(`${API_BASE_URL}/config/settings`);
            
            document.getElementById('user-name').textContent = currentUser.name;
            const domainSelect = document.getElementById('domain-select');
            const createDomainSelect = document.getElementById('create-domain');
            domainSelect.innerHTML = createDomainSelect.innerHTML = '';
            config.domains.forEach(d => {
                domainSelect.add(new Option(d, d));
                createDomainSelect.add(new Option(d, d));
            });
            
            const createUserBtn = document.getElementById('create-user-show-modal-btn');
            createUserBtn.disabled = !currentUser.isHighPrivilege;
            createUserBtn.title = currentUser.isHighPrivilege ? 'Create a new domain user' : 'You do not have permission to create users.';
            
            showScreen('main');
            await handleSearch();

        } catch (error) {
            console.error("Initialization failed:", error);
            document.getElementById('error-title').textContent = 'Access Denied';
            document.getElementById('error-details').textContent = error.detail || error.message || 'You are not authorized to access this portal.';
            showScreen('error');
        }
    };

    const handleSearch = async () => {
        console.log("--- DEBUG: Starting handleSearch() ---");
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
        console.log("--- DEBUG: Fetching from URL:", requestUrl);

        try {
            const users = await apiFetch(requestUrl);
            console.log("--- DEBUG: API response received:", users);

            if (!users || users.length === 0) {
                console.log("--- DEBUG: No users found in the response. Displaying 'No users found.' ---");
                tableBody.innerHTML = '<tr><td colspan="7" class="text-center">No users found.</td></tr>';
                return;
            }
            
            console.log(`--- DEBUG: Found ${users.length} users. Generating table HTML. ---`);
            const tableHtml = users.map(user => `
                <tr>
                    <td>${user.displayName || ''}</td>
                    <td>${user.samAccountName || ''}</td>
                    <td>${user.emailAddress || 'N/A'}</td>
                    <td>${user.enabled ? '<span class="badge text-success-emphasis bg-success-subtle border border-success-subtle rounded-pill">Enabled</span>' : '<span class="badge text-danger-emphasis bg-danger-subtle border border-danger-subtle rounded-pill">Disabled</span>'}</td>
                    <td>${user.hasAdminAccount ? '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-check-circle-fill text-success" viewBox="0 0 16 16"><path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0m-3.97-3.03a.75.75 0 0 0-1.08.022L7.477 9.417 5.384 7.323a.75.75 0 0 0-1.06 1.06L6.97 11.03a.75.75 0 0 0 1.079-.02l3.992-4.99a.75.75 0 0 0-.01-1.05z"/></svg>' : ''}</td>
                    <td>${formatDisplayDate(user.accountExpirationDate)}</td>
                    <td class="action-btn-group">
                        <button class="btn btn-sm btn-secondary" title="Edit User" data-action="edit" data-sam="${user.samAccountName}">...</button>
                        <button class="btn btn-sm btn-warning" title="Reset Password" data-action="reset-pw" data-sam="${user.samAccountName}">...</button>
                        <button class="btn btn-sm btn-info" title="Unlock Account" data-action="unlock" data-sam="${user.samAccountName}">...</button>
                        <button class="btn btn-sm btn-danger" title="Disable Account" data-action="disable" data-sam="${user.samAccountName}">...</button>
                    </td>
                </tr>
            `).join('');
            
            tableBody.innerHTML = tableHtml;
            console.log("--- DEBUG: Table HTML has been rendered. ---");

        } catch (error) {
            console.error("--- DEBUG: An error occurred in handleSearch() ---", error);
            tableBody.innerHTML = `<tr><td colspan="7" class="text-center text-danger">Failed to load users: ${error.detail || error.message}</td></tr>`;
        }
    };
    
    // ... (The rest of the file is unchanged) ...
    const handleShowCreateModal = () => { /* ... */ };
    const handleShowEditModal = async (sam, domain) => { /* ... */ };
    const handleResetPassword = async (sam, domain) => { /* ... */ };
    const handleUnlock = async (sam, domain) => { /* ... */ };
    const handleDisable = async (sam, domain) => { /* ... */ };
    const handleCreateSubmit = async (e) => { /* ... */ };
    const handleEditSubmit = async (e) => { /* ... */ };
    document.getElementById('login-btn').addEventListener('click', initializeApp);
    document.getElementById('logout-btn').addEventListener('click', () => showScreen('login'));
    document.getElementById('try-again-btn').addEventListener('click', () => showScreen('login'));
    document.getElementById('search-users-btn').addEventListener('click', handleSearch);
    document.getElementById('create-user-show-modal-btn').addEventListener('click', () => { handleShowCreateModal(); createUserModal.show(); });
    document.getElementById('create-user-form').addEventListener('submit', handleCreateSubmit);
    document.getElementById('edit-user-form').addEventListener('submit', handleEditSubmit);
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
        }
    });
    document.getElementById('copy-password-btn').addEventListener('click', () => { /* ... */ });
    createUserModal = new bootstrap.Modal(document.getElementById('create-user-modal'));
    editUserModal = new bootstrap.Modal(document.getElementById('edit-user-modal'));
    resetPasswordResultModal = new bootstrap.Modal(document.getElementById('reset-password-result-modal'));
    createUserResultModal = new bootstrap.Modal(document.getElementById('create-user-result-modal'));
    showScreen('login');
});

