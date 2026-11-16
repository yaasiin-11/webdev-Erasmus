const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function passwordResetEmail({ name, link, minutes }) {
  const first = name.split(' ')[0];
  return {
    subject: 'Reset your StudyHub password',
    text: [
      `Hi ${first},`,
      '',
      'Someone asked to reset the password of your StudyHub account. If it was you, open this link and choose a new password:',
      link,
      '',
      `The link works once and for ${minutes} minutes. If you did not ask for it, ignore this email: your password stays the same.`,
    ].join('\n'),
    html: `<p>Hi ${escape(first)},</p>
<p>Someone asked to reset the password of your StudyHub account. If it was you, choose a new password here:</p>
<p><a href="${escape(link)}">Choose a new password</a></p>
<p>The link works once and for ${minutes} minutes. If you did not ask for it, ignore this email: your password stays the same.</p>`,
  };
}
