document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('login-form');
  const loginError = document.getElementById('login-error');
  const authSection = document.getElementById('auth-section');
  const groupsSection = document.getElementById('groups-section');
  const userNav = document.getElementById('user-nav');
  const userProfileName = document.getElementById('user-profile-name');
  const groupsList = document.getElementById('groups-list');

  let currentUser = null;

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

      currentUser = data.user;

      // Successful login (AC-10, AC-2)
      authSection.classList.add('hidden');
      userProfileName.textContent = currentUser.name;
      userNav.classList.remove('hidden');
      groupsSection.classList.remove('hidden');

      loadStudyGroups();
    } catch (err) {
      loginError.textContent = err.message;
      loginError.classList.remove('hidden');
    }
  });

  async function loadStudyGroups() {
    // Loading State
    groupsList.innerHTML = '<p class="loading-state">Loading study groups...</p>';
    try {
      const response = await fetch('/api/groups');
      const groups = await response.json();

      if (!response.ok) {
        throw new Error('Failed to load study groups');
      }

      groupsList.innerHTML = '';

      // Empty State
      if (!groups || groups.length === 0) {
        groupsList.innerHTML = '<p class="empty-state">No study groups available. Check back later or create a new group.</p>';
        return;
      }

      groups.forEach(group => {
        const card = document.createElement('div');
        card.className = 'group-card';
        const maxCapacity = group.max_capacity || 5;
        const memberCount = group.member_count || 0;
        const isFull = memberCount >= maxCapacity;

        // Check if current user is member (we can fetch membership or check via server endpoint)
        // For simplicity in UI rendering, we provide Join / Leave buttons accordingly
        card.innerHTML = `
          <h3>${group.title}</h3>
          <p><strong>Field:</strong> ${group.study_field}</p>
          <p><strong>Meeting Topic:</strong> ${group.meeting_topic}</p>
          <p><strong>Capacity & Members:</strong> ${memberCount} / ${maxCapacity} members</p>
          <p>${group.description}</p>
          <div class="group-actions">
            <button class="join-btn" data-id="${group.id}" ${isFull ? 'disabled' : ''}>${isFull ? 'Full' : 'Join'}</button>
            <button class="leave-btn" data-id="${group.id}">Leave</button>
          </div>
          <div class="card-error error-message hidden"></div>
        `;

        const joinBtn = card.querySelector('.join-btn');
        const leaveBtn = card.querySelector('.leave-btn');
        const cardError = card.querySelector('.card-error');

        joinBtn.addEventListener('click', async () => {
          cardError.classList.add('hidden');
          cardError.textContent = '';
          try {
            const res = await fetch(`/api/groups/${group.id}/join`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: currentUser.id })
            });
            const data = await res.json();
            if (!res.ok) {
              throw new Error(data.error || 'Failed to join group');
            }
            loadStudyGroups();
          } catch (err) {
            cardError.textContent = err.message;
            cardError.classList.remove('hidden');
          }
        });

        leaveBtn.addEventListener('click', async () => {
          cardError.classList.add('hidden');
          cardError.textContent = '';
          try {
            const res = await fetch(`/api/groups/${group.id}/leave`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: currentUser.id })
            });
            const data = await res.json();
            if (!res.ok) {
              throw new Error(data.error || 'Failed to leave group');
            }
            loadStudyGroups();
          } catch (err) {
            cardError.textContent = err.message;
            cardError.classList.remove('hidden');
          }
        });

        groupsList.appendChild(card);
      });
    } catch (err) {
      // Error State
      groupsList.innerHTML = `<div class="error-message">Failed to load study groups: ${err.message}. Please try again later.</div>`;
    }
  }
});
