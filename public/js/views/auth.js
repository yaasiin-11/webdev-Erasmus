import { api } from '../api.js';
import { busy, h, icons, render, svg, toast } from '../dom.js';

const GOOGLE_ERRORS = {
  'google-cancelled': 'Google sign-in was cancelled. You can try again or use your email.',
  'google-state': 'The Google sign-in expired or was started in another tab. Please try again.',
  'google-unverified': 'Your Google email address is not verified, so we cannot use it to sign you in.',
  'google-failed': 'Google did not confirm who you are. Please try again in a moment.',
  'google-off': 'Sign-in with Google is not available on this server. Use your email instead.',
};

function field({ id, label, type = 'text', autocomplete, hint, minlength }) {
  return h('div', { class: 'field' },
    h('label', { for: id, text: label }),
    h('input', { id, name: id.replace(/^(in|up)-/, ''), type, autocomplete, required: true, minlength, 'aria-describedby': hint ? `${id}-hint` : null }),
    hint ? h('span', { class: 'hint', id: `${id}-hint`, text: hint }) : null,
  );
}

function story() {
  const row = (day, time, title, taken, total) => h('li', {},
    h('time', {}, h('span', { text: day }), h('span', { text: time })),
    h('span', { text: title }),
    h('span', { class: 'seats', 'aria-hidden': 'true' },
      Array.from({ length: total }, (_, i) => h('i', { class: i < taken ? '' : 'free' }))),
  );
  return h('section', { class: 'auth-story', 'aria-labelledby': 'story-title' },
    h('p', { class: 'wordmark' }, 'Study', h('span', { text: 'Hub' })),
    h('div', {},
      h('h1', { id: 'story-title', text: 'Nobody passes the hard exams alone.' }),
      h('p', { text: 'Find people preparing the same course, civil service exam or certification. Join their group, book a time, and walk in with a plan for the session.' }),
    ),
    h('ul', { class: 'timetable-strip', 'aria-label': 'Example of a week in StudyHub' },
      row('Mon', '17:00', 'Calculus II, double integrals', 4, 6),
      row('Wed', '18:00', 'Constitutional bodies quiz', 6, 8),
      row('Sat', '10:30', 'AWS practice exam', 2, 4),
    ),
  );
}

export function loginView(main, { state, query, setUser, go }) {
  let mode = 'in';
  const errorBox = h('p', { class: 'alert', role: 'alert', tabindex: '-1', hidden: true });
  const googleError = GOOGLE_ERRORS[query.get('error')];

  const tabIn = h('button', { type: 'button', role: 'tab', id: 'tab-in', 'aria-controls': 'auth-form' }, 'Sign in');
  const tabUp = h('button', { type: 'button', role: 'tab', id: 'tab-up', 'aria-controls': 'auth-form' }, 'Create account');
  const form = h('form', { id: 'auth-form', class: 'form-grid', role: 'tabpanel', novalidate: true });
  const submit = h('button', { type: 'submit', class: 'btn btn-primary' });

  function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
    errorBox.focus();
  }

  function draw() {
    const signIn = mode === 'in';
    tabIn.setAttribute('aria-selected', String(signIn));
    tabUp.setAttribute('aria-selected', String(!signIn));
    tabIn.tabIndex = signIn ? 0 : -1;
    tabUp.tabIndex = signIn ? -1 : 0;
    form.setAttribute('aria-labelledby', signIn ? 'tab-in' : 'tab-up');
    submit.textContent = signIn ? 'Sign in' : 'Create account';
    errorBox.hidden = true;
    render(form,
      signIn ? null : field({ id: 'up-name', label: 'Your name', autocomplete: 'name' }),
      field({ id: `${mode}-email`, label: 'Email', type: 'email', autocomplete: 'email' }),
      field({
        id: `${mode}-password`,
        label: 'Password',
        type: 'password',
        autocomplete: signIn ? 'current-password' : 'new-password',
        hint: signIn ? null : 'At least 8 characters.',
        minlength: signIn ? null : 8,
      }),
      submit,
      signIn ? h('a', { class: 'forgot-link', href: '#/forgot' }, 'Forgot your password?') : null,
    );
  }

  for (const [tab, value] of [[tabIn, 'in'], [tabUp, 'up']]) {
    tab.addEventListener('click', () => {
      mode = value;
      draw();
    });
    tab.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        mode = mode === 'in' ? 'up' : 'in';
        draw();
        (mode === 'in' ? tabIn : tabUp).focus();
      }
    });
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    if (mode === 'in' && (!data.email || !data.password)) {
      showError('Email and password are required');
      return;
    }
    const done = busy(submit, mode === 'in' ? 'Signing in…' : 'Creating account…');
    try {
      const { user } = await api(mode === 'in' ? '/auth/login' : '/auth/register', { method: 'POST', body: data });
      setUser(user);
      toast(mode === 'in' ? `Welcome back, ${user.name.split(' ')[0]}.` : `Your account is ready, ${user.name.split(' ')[0]}.`);
      const next = state.next ?? '/groups';
      state.next = null;
      go(next);
    } catch (error) {
      done();
      showError(error.message);
    }
  });

  draw();

  const google = state.providers.google
    ? [
        h('p', { class: 'or', text: 'or' }),
        h('a', { class: 'btn btn-google', href: '/api/auth/google' }, svg(icons.google), 'Continue with Google'),
      ]
    : null;

  const demo = state.providers.demo
    ? h('p', { class: 'demo-note' }, 'Trying it out? Sign in as ', h('code', { text: 'ana@studyhub.test' }), ' with the password ', h('code', { text: 'StudyHub2026!' }), '.')
    : null;

  render(main, h('div', { class: 'auth' },
    story(),
    h('section', { class: 'auth-panel', 'aria-label': 'Sign in or create an account' },
      h('div', { class: 'auth-card' },
        h('h2', { text: 'Your study groups are waiting' }),
        googleError ? h('p', { class: 'alert', role: 'alert', text: googleError }) : null,
        h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Account' }, tabIn, tabUp),
        errorBox,
        form,
        google,
        demo,
      ),
    ),
  ));
}

function authShell(main, ...content) {
  render(main, h('div', { class: 'auth' },
    story(),
    h('section', { class: 'auth-panel', 'aria-label': 'Account recovery' },
      h('div', { class: 'auth-card' }, ...content)),
  ));
}

export function forgotView(main) {
  const errorBox = h('p', { class: 'alert', role: 'alert', tabindex: '-1', hidden: true });
  const submit = h('button', { type: 'submit', class: 'btn btn-primary' }, 'Send me a link');
  const form = h('form', { class: 'form-grid', novalidate: true },
    field({ id: 'fg-email', label: 'Email of your account', type: 'email', autocomplete: 'email' }),
    submit,
  );
  form.elements[0].name = 'email';

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorBox.hidden = true;
    const email = form.elements.email.value.trim();
    if (!email) {
      errorBox.textContent = 'Enter the email you signed up with.';
      errorBox.hidden = false;
      errorBox.focus();
      return;
    }
    const done = busy(submit, 'Sending…');
    try {
      const { message } = await api('/auth/forgot', { method: 'POST', body: { email } });
      authShell(main,
        h('h2', { text: 'Check your inbox' }),
        h('p', { role: 'status', text: message }),
        h('p', { class: 'demo-note', text: 'Nothing after a few minutes? Look in the spam folder, or ask for a new link.' }),
        h('div', { class: 'form-actions' },
          h('a', { class: 'btn', href: '#/login' }, 'Back to sign in'),
          h('button', { type: 'button', class: 'btn btn-quiet', on: { click: () => forgotView(main) } }, 'Send another link'),
        ),
      );
    } catch (error) {
      done();
      errorBox.textContent = error.message;
      errorBox.hidden = false;
      errorBox.focus();
    }
  });

  authShell(main,
    h('h2', { text: 'Forgot your password?' }),
    h('p', { text: 'Enter the email of your account and we will send you a link to choose a new password. The link works once, for 30 minutes.' }),
    errorBox,
    form,
    h('a', { class: 'forgot-link', href: '#/login' }, 'Back to sign in'),
  );
}

export function resetView(main, { query, setUser, go }) {
  const token = query.get('token');
  if (!token) {
    authShell(main,
      h('h2', { text: 'This link is incomplete' }),
      h('p', { text: 'Open the link from the email again, or ask for a new one.' }),
      h('a', { class: 'btn btn-primary', href: '#/forgot' }, 'Ask for a new link'),
    );
    return;
  }
  const errorBox = h('p', { class: 'alert', role: 'alert', tabindex: '-1', hidden: true });
  const submit = h('button', { type: 'submit', class: 'btn btn-primary' }, 'Save new password');
  const form = h('form', { class: 'form-grid', novalidate: true },
    field({ id: 'rs-password', label: 'New password', type: 'password', autocomplete: 'new-password', hint: 'At least 8 characters.', minlength: 8 }),
    field({ id: 'rs-confirm', label: 'Repeat the new password', type: 'password', autocomplete: 'new-password', minlength: 8 }),
    submit,
  );

  const fail = (message) => {
    errorBox.textContent = message;
    errorBox.hidden = false;
    errorBox.focus();
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorBox.hidden = true;
    const password = form.elements[0].value;
    if (password.length < 8) return fail('Password must be between 8 and 128 characters.');
    if (password !== form.elements[1].value) return fail('The two passwords are different. Type the same one twice.');
    const done = busy(submit, 'Saving…');
    try {
      const { user } = await api('/auth/reset', { method: 'POST', body: { token, password } });
      history.replaceState(null, '', '#/groups');
      setUser(user);
      toast('Password changed. You are signed in, and other devices were signed out.');
      go('/groups');
    } catch (error) {
      done();
      fail(error.message);
    }
    return undefined;
  });

  authShell(main,
    h('h2', { text: 'Choose a new password' }),
    errorBox,
    form,
    h('a', { class: 'forgot-link', href: '#/forgot' }, 'Ask for a new link'),
  );
}
