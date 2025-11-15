/*
  js/tab-profile.js
  FULL PRODUCTION MODE - NO DUMMY
  
  PERUBAHAN:
  - Semua logic dummy dihapus
  - Host input selalu tampil (wajib)
  - Auto redirect ke general setelah login sukses
*/

import { appState } from './app.js';
import { addLog } from './utils.js';
import { login, logout } from './auth.js';

export function initializeProfileTab() {
  
  const loggedInView = document.getElementById('profile-loggedin-view');
  const loginView = document.getElementById('profile-login-view');

  if (appState.isAuthenticated && appState.user) {
    // Tampilkan Info Profile
    loginView.classList.add('hidden');
    loggedInView.classList.remove('hidden');

    const profileStatus = document.getElementById('profile-status');
    const profileUsername = document.getElementById('profile-username');
    const profileEmail = document.getElementById('profile-email');
    const profileLicense = document.getElementById('profile-license');
    const logoutButton = document.getElementById('profile-logout-button');
    const changePassButton = document.getElementById('profile-change-pass-button');
    const passOld = document.getElementById('profile-pass-old');
    const passNew = document.getElementById('profile-pass-new');
    const passConfirm = document.getElementById('profile-pass-confirm');

    profileStatus.textContent = 'Terautentikasi';
    profileStatus.className = 'font-semibold text-green-600';
    profileUsername.textContent = appState.user.username;
    profileEmail.textContent = appState.user.email;
    profileLicense.textContent = appState.user.license;
    
    if (appState.user.license === 'Premium') {
      profileLicense.className = 'text-lg font-bold text-blue-600';
    } else if (appState.user.license === 'Enterprise') {
      profileLicense.className = 'text-lg font-bold text-purple-600';
    } else {
      profileLicense.className = 'text-lg font-bold text-gray-600';
    }

    logoutButton.addEventListener('click', () => {
      if (confirm('Apakah Anda yakin ingin Logout?')) {
        logout();
      }
    });

    changePassButton.addEventListener('click', () => {
      addLog('INFO', 'Tombol ubah password diklik (feature not implemented yet).');
      alert('Fungsi ubah password belum tersedia. Hubungi administrator.');
      
      passOld.value = '';
      passNew.value = '';
      passConfirm.value = '';
    });

  } else {
    // Tampilkan Form Login
    loginView.classList.remove('hidden');
    loggedInView.classList.add('hidden');

    const loginButton = document.getElementById('login-button');
    const loginUsername = document.getElementById('login-username');
    const loginPassword = document.getElementById('login-password');
    const loginErrorMsg = document.getElementById('login-error-msg');
    const loginHostDiv = document.getElementById('login-host-div');
    const loginHostInput = document.getElementById('login-host');

    // Host input selalu tampil
    loginHostDiv.classList.remove('hidden');
    loginHostInput.value = appState.backendHost;

    // Memuat kredensial terakhir
    const lastLogin = localStorage.getItem('trafficBusterLastLogin');
    if (lastLogin) {
      try {
        const creds = JSON.parse(lastLogin);
        loginUsername.value = creds.user || '';
        loginHostInput.value = creds.host || appState.backendHost;
      } catch(e) {
        console.warn('Gagal memuat kredensial login terakhir:', e);
        localStorage.removeItem('trafficBusterLastLogin');
      }
    }

    // Listener Tombol Login
    loginButton.addEventListener('click', async () => {
      const user = loginUsername.value.trim();
      const pass = loginPassword.value;
      const host = loginHostInput.value.trim();
      
      loginErrorMsg.textContent = '';
      
      if (!user || !pass) {
        loginErrorMsg.textContent = 'Username dan Password tidak boleh kosong.';
        return;
      }
      
      if (!host) {
        loginErrorMsg.textContent = 'Backend Host tidak boleh kosong.';
        return;
      }

      // Menyimpan kredensial (tanpa password)
      localStorage.setItem('trafficBusterLastLogin', JSON.stringify({ 
        user: user, 
        host: host 
      }));

      loginButton.disabled = true;
      loginButton.textContent = 'Logging in...';
      
      const result = await login(user, pass, host);
      
      loginButton.disabled = false;
      loginButton.textContent = 'Login';

      if (!result.success) {
        loginErrorMsg.textContent = result.message;
      } else {
        appState.backendHost = host;
      }
    });
    
    // Listener "Enter-to-Login"
    const handleEnterKey = (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        loginButton.click();
      }
    };
    
    loginUsername.addEventListener('keydown', handleEnterKey);
    loginPassword.addEventListener('keydown', handleEnterKey);
    loginHostInput.addEventListener('keydown', handleEnterKey);
  }
}