document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('login-form');
  const loginError = document.getElementById('login-error');
  const authSection = document.getElementById('auth-section');
  const groupsSection = document.getElementById('groups-section');
  const userNav = document.getElementById('user-nav');
  const userProfileName = document.getElementById('user-profile-name');
  const groupsList = document.getElementById('groups-list');

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.classList.add('hidden');
    loginError.textContent = '';

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    if (!email || !password) {
      loginError.textContent = 'Email and password are required';
      loginError.classList.remove('hidden');
      return;
    }

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to sign in');
      }

      // Successful login (AC-10, AC-2)
      authSection.classList.add('hidden');
      userProfileName.textContent = data.user.name;
      userNav.classList.remove('hidden');
      groupsSection.classList.remove('hidden');

      loadStudyGroups();
    } catch (err) {
      loginError.textContent = err.message;
      loginError.classList.remove('hidden');
    }
  });

  async function loadStudyGroups() {
    try {
      const response = await fetch('/api/groups');
      const groups = await response.json();

      if (!response.ok) {
        throw new Error('Failed to load study groups');
      }

      groupsList.innerHTML = '';
      if (groups.length === 0) {
        groupsList.innerHTML = '<p>No study groups available.</p>';
        return;
      }

      groups.forEach(group => {
        const card = document.createElement('div');
        card.className = 'group-card';
        card.innerHTML = `
          <h3>${group.title}</h3>
          <p><strong>Field:</strong> ${group.study_field}</p>
          <p><strong>Meeting Topic:</strong> ${group.meeting_topic}</p>
          <p><strong>Members:</strong> ${group.member_count}</p>
          <p>${group.description}</p>
        `;
        groupsList.appendChild(card);
      });
    } catch (err) {
      groupsList.innerHTML = `<p class="error-message">${err.message}</p>`;
    }
  }
});
