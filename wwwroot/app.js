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
    const setupMainApplication = async () => {
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
        await handleSearch();
    };
    
    const tryAutoLogin = async () => {
        try {
            currentUser = await apiFetch(`${API_BASE_URL}/auth/me`);
            config = await apiFetch(`${API_BASE_URL}/config/settings`);
            await setupMainApplication();
        } catch (error) {
            showScreen('login');
        }
    };

    const handleLoginClick = async () => {
        try {
            if (!await checkApiHealth()) {
                document.getElementById('error-title').textContent = 'Connection Error';
                document.getElementById('error-details').textContent = "API Service is not available. Please contact your Administrator.";
                showScreen('error');
                return;
            }
            
            currentUser = await apiFetch(`${API_BASE_URL}/auth/me`);
            config = await apiFetch(`${API_BASE_URL}/config/settings`);
            await setupMainApplication();
        } catch (error) {
            document.getElementById('error-title').textContent = 'Access Denied';
            document.getElementById('error-details').textContent = error.detail || error.message || 'You are not authorized to access this portal.';
            showScreen('error');
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
            tableBody.innerHTML = `<tr><td colspan="7" class="text-center text-danger">Failed to load users: ${error.detail || error.message}</td></tr>`;
        }
    };
    
    const handleShowCreateModal = () => {
        document.getElementById('create-user-form').reset();
        const expirationInput = document.getElementById('create-expiration');
        const today = new Date();
        const oneYearFromNow = new Date();
        oneYearFromNow.setFullYear(today.getFullYear() + 1);
        expirationInput.min = toISODateString(today);
        expirationInput.max = toISODateString(oneYearFromNow);
        expirationInput.value = toISODateString(oneYearFromNow);
        const groupsContainer = document.getElementById('create-optional-groups-container');
        const adminContainer = document.getElementById('create-admin-container');
        if (currentUser.isHighPrivilege) {
            adminContainer.style.display = 'block';
            const groupsList = document.getElementById('create-optional-groups-list');
            if (config.optionalGroupsForHighPrivilege && config.optionalGroupsForHighPrivilege.length > 0) {
                groupsContainer.style.display = 'block';
                groupsList.innerHTML = config.optionalGroupsForHighPrivilege.map(g => `<div class="form-check"><input class="form-check-input" type="checkbox" value="${g}" id="create-group-${g}"><label class="form-check-label" for="create-group-${g}">${g}</label></div>`).join('');
            } else {
                groupsContainer.style.display = 'none';
            }
        } else {
            groupsContainer.style.display = 'none';
            adminContainer.style.display = 'none';
        }
    };

    const handleShowEditModal = async (sam, domain) => {
        document.getElementById('edit-user-form').reset();
        try {
            const userDetails = await apiFetch(`${API_BASE_URL}/users/details/${domain}/${sam}`);

            // FIX: Add a check to ensure userDetails is not null before proceeding.
            if (!userDetails) {
                showAlert(`Could not find details for user '${sam}'. The user may have been deleted or is outside the configured search scope.`, 'warning');
                return; // Stop execution to prevent errors.
            }

            document.getElementById('edit-username-display').value = userDetails.samAccountName;
            document.getElementById('edit-samaccountname').value = userDetails.samAccountName;
            document.getElementById('edit-firstname').value = userDetails.firstName || '';
            document.getElementById('edit-lastname').value = userDetails.lastName || '';
            document.getElementById('edit-domain').value = domain;

            const expirationInput = document.getElementById('edit-expiration');
            const today = new Date();
            const oneYearFromNow = new Date();
            oneYearFromNow.setFullYear(today.getFullYear() + 1);
            expirationInput.min = toISODateString(today);
            expirationInput.max = toISODateString(oneYearFromNow);
            expirationInput.value = formatDateForInput(userDetails.accountExpirationDate) || toISODateString(oneYearFromNow);
            
            const groupsContainer = document.getElementById('edit-optional-groups-container');
            const adminContainer = document.getElementById('edit-admin-container');
            if (currentUser.isHighPrivilege) {
                adminContainer.style.display = 'block';
                document.getElementById('edit-admin-account').checked = userDetails.hasAdminAccount;
                const groupsList = document.getElementById('edit-optional-groups-list');
                if (config.optionalGroupsForHighPrivilege && config.optionalGroupsForHighPrivilege.length > 0) {
                    groupsContainer.style.display = 'block';
                    groupsList.innerHTML = config.optionalGroupsForHighPrivilege.map(g => `<div class="form-check"><input class="form-check-input" type="checkbox" value="${g}" id="edit-group-${g}" ${userDetails.memberOf.includes(g) ? 'checked' : ''}><label class="form-check-label" for="edit-group-${g}">${g}</label></div>`).join('');
                } else {
                    groupsContainer.style.display = 'none';
                }
            } else {
                groupsContainer.style.display = 'none';
                adminContainer.style.display = 'none';
            }
            editUserModal.show();
        } catch (error) {
            showAlert(`Failed to load user details: ${error.detail || error.message}`);
        }
    };

    const handleResetPassword = async (sam, domain) => {
        if (!confirm(`Are you sure you want to reset the password for ${sam}? A new random password will be generated.`)) return;
        try {
            const result = await apiFetch(`${API_BASE_URL}/users/reset-password`, { method: 'POST', body: { domain, samAccountName: sam } });
            document.getElementById('reset-pw-result-username').textContent = result.samAccountName;
            document.getElementById('reset-pw-result-new').value = result.newPassword;
            resetPasswordResultModal.show();
        } catch (error) {
            showAlert(`Failed to reset password: ${error.detail || error.message}`);
        }
    };

    const handleUnlock = async (sam, domain) => {
         if (!confirm(`Are you sure you want to unlock the account for ${sam}?`)) return;
        try {
            await apiFetch(`${API_BASE_URL}/users/unlock`, { method: 'POST', body: { domain, samAccountName: sam } });
            showAlert(`Successfully unlocked account: ${sam}`, 'success');
            handleSearch();
        } catch (error) {
            showAlert(`Failed to unlock account: ${error.detail || error.message}`);
        }
    };

    const handleDisable = async (sam, domain) => {
        if (!confirm(`Are you sure you want to DISABLE the account for ${sam}?`)) return;
        try {
            await apiFetch(`${API_BASE_URL}/users/disable`, { method: 'POST', body: { domain, samAccountName: sam } });
            showAlert(`Successfully disabled account: ${sam}`, 'success');
            handleSearch();
        } catch (error) {
            showAlert(`Failed to disable account: ${error.detail || error.message}`);
        }
    };

    const handleEnable = async (sam, domain) => {
        if (!confirm(`Are you sure you want to ENABLE the account for ${sam}?`)) return;
        try {
            await apiFetch(`${API_BASE_URL}/users/enable`, { method: 'POST', body: { domain, samAccountName: sam } });
            showAlert(`Successfully enabled account: ${sam}`, 'success');
            handleSearch();
        } catch (error) {
            showAlert(`Failed to enable account: ${error.detail || error.message}`);
        }
    };

    const handleCreateSubmit = async (e) => {
        e.preventDefault();
        const form = e.target;
        if (!form.checkValidity()) { 
            form.classList.add('was-validated');
            e.stopPropagation(); 
            return; 
        }
        const expirationDate = form.querySelector('#create-expiration').value;
        const optionalGroups = Array.from(form.querySelectorAll('#create-optional-groups-list input:checked')).map(cb => cb.value);
        const data = {
            domain: form.querySelector('#create-domain').value,
            firstName: form.querySelector('#create-firstname').value,
            lastName: form.querySelector('#create-lastname').value,
            samAccountName: form.querySelector('#create-samaccountname').value,
            optionalGroups: optionalGroups,
            createAdminAccount: form.querySelector('#create-admin-account').checked,
            accountExpirationDate: expirationDate
        };
        try {
            const result = await apiFetch(`${API_BASE_URL}/users/create`, { method: 'POST', body: data });
            createUserModal.hide();
            const resultBody = document.getElementById('create-user-result-body');
            let resultHtml = `<h6>${result.message}</h6>`;
            if (result.userAccount) {
                resultHtml += `<h5 class="mt-4">User Account Details</h5><table class="table table-sm result-table"><tr><td><strong>Username:</strong></td><td>${result.userAccount.samAccountName}</td></tr><tr><td><strong>Display Name:</strong></td><td>${result.userAccount.displayName}</td></tr><tr><td><strong>Temporary Password:</strong></td><td><code>${result.userAccount.initialPassword}</code></td></tr></table>`;
            }
            if (result.adminAccount) {
                resultHtml += `<h5 class="mt-4">Admin Account Details</h5><table class="table table-sm result-table"><tr><td><strong>Username:</strong></td><td>${result.adminAccount.samAccountName}</td></tr><tr><td><strong>Display Name:</strong></td><td>${result.adminAccount.displayName}</td></tr><tr><td><strong>Temporary Password:</strong></td><td><code>${result.adminAccount.initialPassword}</code></td></tr></table>`;
            }
            if(result.groupsAssociated && result.groupsAssociated.length > 0){
                resultHtml += `<h5 class="mt-4">Associated Groups</h5><p>${result.groupsAssociated.join(', ')}</p>`;
            }
            resultBody.innerHTML = resultHtml;
            createUserResultModal.show();
            handleSearch();
        } catch (error) {
            const validationErrors = error.errors ? Object.values(error.errors).flat().join(' ') : '';
            showAlert(`Failed to create user: ${error.detail || error.message} ${validationErrors}`);
        }
    };
    
    const handleEditSubmit = async (e) => {
        e.preventDefault();
        const form = e.target;
         if (!form.checkValidity()) { 
            form.classList.add('was-validated');
            e.stopPropagation(); 
            return; 
        }
        const expirationDate = form.querySelector('#edit-expiration').value;
        const optionalGroups = Array.from(form.querySelectorAll('#edit-optional-groups-list input:checked')).map(cb => cb.value);
        const data = {
            domain: form.querySelector('#edit-domain').value,
            samAccountName: form.querySelector('#edit-samaccountname').value,
            firstName: form.querySelector('#edit-firstname').value,
            lastName: form.querySelector('#edit-lastname').value,
            optionalGroups: optionalGroups,
            manageAdminAccount: form.querySelector('#edit-admin-account').checked,
            accountExpirationDate: expirationDate
        };
        try {
            await apiFetch(`${API_BASE_URL}/users/update`, { method: 'PUT', body: data });
            editUserModal.hide();
            showAlert(`Successfully updated user: ${data.samAccountName}`, 'success');
            handleSearch();
        } catch (error) {
            const validationErrors = error.errors ? Object.values(error.errors).flat().join(' ') : '';
            showAlert(`Failed to update user: ${error.detail || error.message} ${validationErrors}`);
        }
    };

    // --- Event Listeners and Initialization ---
    document.getElementById('login-btn').addEventListener('click', handleLoginClick);
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

    document.getElementById('create-user-form').addEventListener('submit', handleCreateSubmit);
    document.getElementById('edit-user-form').addEventListener('submit', handleEditSubmit);

    createUserModal = new bootstrap.Modal(document.getElementById('create-user-modal'));
    editUserModal = new bootstrap.Modal(document.getElementById('edit-user-modal'));
    resetPasswordResultModal = new bootstrap.Modal(document.getElementById('reset-password-result-modal'));
    createUserResultModal = new bootstrap.Modal(document.getElementById('create-user-result-modal'));

    tryAutoLogin();
});
