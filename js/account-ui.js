(function () {
  'use strict';
  const I18n = window.TodoI18n;
  const { tr, trMessage, msg } = I18n;
  const Sync = window.DailoSync || null;

  // The account, a module since R112 (plan part 3a): the welcome screen and sign-in. Its markup is in
  // js/settings-ui.js (renderRoute for the 'welcome' window); the account windows, signing out and the sync stay in
  // app.js until their own parts. app.js asks this module by name (accountAction) at start, after "Odjavi se", when
  // the form is sent, when Google or Apple returns to the app and to put the screen away.
  // The app's helpers come from the first domain context the module receives; the live data, the open window, the
  // device's sync record, the return focus and the start-up flags are read through it each time (app.*).
  let app = null;
  let syncClient, loadSyncMeta, saveSyncMeta, completeSignIn, runSync, captureModalReturnFocus, restoreModalReturnFocus, closePopover, renderModal, render, setToastMessage, $, nowIso;
  function use(ctx) {
    if (app) return;
    app = ctx;
    ({ syncClient, loadSyncMeta, saveSyncMeta, completeSignIn, runSync, captureModalReturnFocus, restoreModalReturnFocus, closePopover, renderModal, render, setToastMessage, $, nowIso } = ctx);
  }

  // R40: the welcome screen (first launch, and "Prijavi se" / "Napravi nalog" on Nalog). Sign-in is by e-mail and
  // password, with a code from the e-mail to confirm a new account or set a new password, or with Google or Apple
  // through the browser (PKCE). The device-local key "dailoWelcome" (outside state, backups and sync) remembers that
  // the first screen was answered.
  const WELCOME_KEY = 'dailoWelcome';
  const WELCOME_MODES = ['sign-in', 'sign-up', 'confirm', 'reset', 'reset-code'];
  const AUTH_REDIRECT_APP = 'dailo://auth';

  function welcomeDue() {
    if (!syncClient || loadSyncMeta().session?.accessToken) return false;
    try { return !localStorage.getItem(WELCOME_KEY); } catch (_) { return false; }
  }

  function rememberWelcome() {
    try { localStorage.setItem(WELCOME_KEY, '1'); } catch (_) { /* the screen comes back at the next start */ }
  }

  function openWelcome(mode = 'sign-in', { firstRun = false } = {}) {
    if (!syncClient || (app.modalState && app.modalState.type !== 'welcome')) return;
    if (!app.modalState) { captureModalReturnFocus(); closePopover(); }
    app.setModalState({ type: 'welcome', mode: WELCOME_MODES.includes(mode) ? mode : 'sign-in', name: '', email: '', password: '', confirm: '', code: '', terms: false,
      showPassword: false, busy: false, error: '', firstRun, onCancel: closeWelcome });
    renderModal();
  }

  // R60: a link from an account e-mail lands here with its outcome in the address. Only the message is taken: the
  // session in it is never used, so a link from someone else cannot sign this device into their account.
  const AUTH_LANDING_MESSAGES = Object.freeze({
    confirmed: msg('Your e-mail address is confirmed. Sign in with your password.'),
    email: msg('Your new e-mail address is confirmed.'),
    recovery: msg('For a new password, use the code from the e-mail: Sign in → Forgot password?'),
    expired: msg('The link has expired or was already used. Ask for a new code in Dailo.'),
    failed: msg('The link did not work. Ask for a new code in Dailo.'),
  });
  function consumeAuthLanding() {
    const landing = Sync?.authLanding?.(location.hash) || (loadSyncMeta().pkce ? null : Sync?.authLanding?.(location.search));
    if (!landing) return false;
    history.replaceState(null, '', location.pathname);
    setToastMessage(tr(AUTH_LANDING_MESSAGES[landing.kind]));
    if (landing.kind === 'confirmed' && syncClient && !loadSyncMeta().session?.accessToken) openWelcome('sign-in');
    return true;
  }

  // At start: a Google or Apple sign-in coming back to the web page, otherwise the first screen when it is due.
  function startWelcome() {
    const returning = consumeAuthRedirect();
    if (returning) return returning;
    if (consumeAuthLanding()) return true;
    if (welcomeDue() && app.state && !app.recovery && !app.storageError && !app.staleDataNotice && !app.globalOperation && !app.modalState) openWelcome('sign-in', { firstRun: true });
  }

  // Back and Escape step from the other steps to sign-in, then close the screen like "Nastavi bez naloga".
  function closeWelcome() {
    if (app.modalState?.type !== 'welcome') return;
    if (app.modalState.mode !== 'sign-in') { welcomeMode('sign-in'); return; }
    if (app.modalState.firstRun) rememberWelcome();
    dismissWelcome();
  }

  function skipWelcome() {
    rememberWelcome();
    dismissWelcome();
  }

  function dismissWelcome() {
    if (app.modalState?.type === 'welcome') { app.setModalState(null); renderModal(); }
    const target = app.modalReturnFocus;
    app.setModalReturnFocus(null);
    if (target) restoreModalReturnFocus(target);
  }

  function setWelcome(changes) {
    if (app.modalState?.type !== 'welcome') return;
    app.setModalState({ ...app.modalState, ...changes });
    renderModal();
  }

  // What is typed stays in the window's state, so a redraw (an error, the eye, another step) keeps it.
  function welcomeFields() {
    const welcome = app.modalState;
    const fields = { name: 'welcome-name', email: 'welcome-email', password: 'welcome-password', confirm: 'welcome-password-confirm', code: 'welcome-code' };
    for (const [key, id] of Object.entries(fields)) {
      const field = $(`#${id}`);
      if (field) welcome[key] = ['password', 'confirm'].includes(key) ? String(field.value ?? '') : String(field.value ?? '').trim();
    }
    const terms = $('#welcome-terms');
    if (terms) welcome.terms = Boolean(terms.checked);
    return welcome;
  }

  function welcomeMode(mode) {
    if (app.modalState?.type !== 'welcome' || !WELCOME_MODES.includes(mode)) return;
    welcomeFields();
    setWelcome({ mode, password: '', confirm: '', code: '', error: '', busy: false });
  }

  function toggleWelcomePassword() {
    if (app.modalState?.type !== 'welcome') return;
    welcomeFields();
    setWelcome({ showPassword: !app.modalState.showPassword });
  }

  const welcomeCode = welcome => String(welcome.code || '').replace(/\s+/g, '');

  function welcomeProblem(welcome) {
    const { mode } = welcome;
    if (['sign-in', 'sign-up', 'reset'].includes(mode) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(welcome.email)) return msg('Enter a valid e-mail address.');
    if (mode === 'sign-in' && !welcome.password) return msg('Enter your password.');
    if (['confirm', 'reset-code'].includes(mode) && !/^\d{6,10}$/.test(welcomeCode(welcome))) return msg('Enter the code from the e-mail.');
    if (['sign-up', 'reset-code'].includes(mode)) {
      const weak = Sync.passwordProblem(welcome.password);
      if (weak) return weak;
      if (welcome.confirm !== welcome.password) return msg('The passwords do not match.');
    }
    if (mode === 'sign-up' && !welcome.terms) return msg('Accept the Terms of Use and the Privacy Policy to continue.');
    return '';
  }

  // R42: the client already turns Supabase's answers into sentences; a refused code reads the same whatever its cause.
  function welcomeErrorText(error, mode) {
    if (['confirm', 'reset-code'].includes(mode) && error?.status >= 400 && error?.status < 500 && ![429, 422].includes(error.status)) return msg('The code is wrong or has expired.');
    return error?.message || String(error);
  }

  async function welcomeSubmit() {
    if (!syncClient || app.modalState?.type !== 'welcome' || app.modalState.busy) return;
    const welcome = welcomeFields();
    const problem = welcomeProblem(welcome);
    if (problem) { setWelcome({ error: problem }); return; }
    const { mode, email } = welcome;
    setWelcome({ busy: true, error: '' });
    try {
      if (mode === 'sign-in') await finishWelcome(await syncClient.signIn(email, welcome.password));
      else if (mode === 'sign-up') {
        const result = await syncClient.signUp(email, welcome.password, { fullName: welcome.name, termsAcceptedAt: nowIso() });
        if (result.session) await finishWelcome(result.session);
        else setWelcome({ mode: 'confirm', busy: false, code: '' });
      } else if (mode === 'confirm') await finishWelcome(await syncClient.verifyCode(email, welcomeCode(welcome)));
      else if (mode === 'reset') {
        await syncClient.requestPasswordReset(email);
        setWelcome({ mode: 'reset-code', busy: false, code: '', password: '', confirm: '' });
      } else if (mode === 'reset-code') {
        const session = await syncClient.verifyRecovery(email, welcomeCode(welcome));
        await syncClient.updatePassword(session, welcome.password);
        await finishWelcome(session, true);
      }
    } catch (error) {
      // An address that was never confirmed gets a new code; an address that has an account goes to sign-in.
      if (mode === 'sign-in' && (error?.reason === 'email_not_confirmed' || /not confirmed/i.test(error?.message || ''))) {
        try { await syncClient.resendSignUp(email); } catch (_) { /* "Pošalji novi kod" asks again */ }
        setWelcome({ mode: 'confirm', busy: false, code: '', error: msg('Confirm the e-mail address first. We sent a new code.') });
      } else if (mode === 'sign-up' && error?.reason === 'user_already_exists') {
        setWelcome({ mode: 'sign-in', busy: false, password: '', confirm: '', error: msg('An account with this e-mail address already exists. Sign in.') });
      } else setWelcome({ busy: false, error: welcomeErrorText(error, mode) });
    }
  }

  async function welcomeResend() {
    if (!syncClient || app.modalState?.type !== 'welcome' || app.modalState.busy) return;
    const welcome = welcomeFields();
    setWelcome({ busy: true, error: '' });
    try {
      if (welcome.mode === 'reset-code') await syncClient.requestPasswordReset(welcome.email);
      else await syncClient.resendSignUp(welcome.email);
      setWelcome({ busy: false });
      setToastMessage(tr('A new code was sent.'));
    } catch (error) { setWelcome({ busy: false, error: welcomeErrorText(error, welcome.mode) }); }
  }

  async function finishWelcome(session, passwordSaved = false) {
    completeSignIn(session);
    rememberWelcome();
    dismissWelcome();
    render();
    const email = session.user?.email || '';
    setToastMessage(passwordSaved ? tr('Password saved. Signed in: {email}', { email }) : tr('Signed in: {email}', { email }));
    await runSync();
  }

  // Google and Apple: the provider is checked first, the code verifier stays in the device-local sync record, and
  // the provider returns to this page (web) or to dailo://auth through the system browser (app).
  async function startProviderSignIn(provider) {
    if (!syncClient || !['google', 'apple'].includes(provider) || app.modalState?.type !== 'welcome' || app.modalState.busy) return;
    welcomeFields();
    setWelcome({ busy: true, error: '' });
    try {
      const settings = await syncClient.authSettings();
      if (!settings?.external?.[provider]) {
        setWelcome({ busy: false, error: provider === 'google' ? msg('Sign-in with Google is not turned on yet.') : msg('Sign-in with Apple is not turned on yet.') });
        return;
      }
      const verifier = Sync.createCodeVerifier();
      const codeChallenge = await Sync.codeChallenge(verifier);
      const platform = globalThis.DailoPlatform;
      const redirectTo = platform?.isNative ? AUTH_REDIRECT_APP : `${location.origin}${location.pathname}`;
      app.setSyncMeta({ ...loadSyncMeta(), pkce: { verifier, provider, at: Date.now() } });
      saveSyncMeta();
      const url = syncClient.authorizeUrl({ provider, redirectTo, codeChallenge });
      if (platform?.isNative) { setWelcome({ busy: false }); platform.links.openExternal(url); }
      else location.assign(url);
    } catch (error) { setWelcome({ busy: false, error: welcomeErrorText(error, 'provider') }); }
  }

  async function finishProviderSignIn(params) {
    if (!syncClient) return;
    globalThis.DailoPlatform?.links?.closeExternal?.();
    const pending = loadSyncMeta().pkce;
    const failure = params.get('error_description') || params.get('error');
    const code = params.get('code');
    let problem = failure ? `${msg('Sign-in did not finish')}: ${failure}` : !code || !pending?.verifier ? msg('Sign-in did not finish. Try again.') : '';
    if (!problem) {
      try { await finishWelcome(await syncClient.exchangeCode(code, pending.verifier)); return; }
      catch (error) { problem = error?.message || String(error); }
    }
    app.setSyncMeta(loadSyncMeta());
    delete app.syncMeta.pkce;
    saveSyncMeta();
    if (app.modalState?.type !== 'welcome') openWelcome('sign-in');
    if (app.modalState?.type === 'welcome') setWelcome({ busy: false, error: problem });
    else setToastMessage(trMessage(problem));
  }

  // The web page comes back from Google or Apple with ?code= (or ?error=). Only a sign-in this device started counts.
  function consumeAuthRedirect() {
    const params = new URLSearchParams(location.search);
    if (!params.has('code') && !params.has('error')) return false;
    if (!syncClient || !loadSyncMeta().pkce) return false;
    history.replaceState(null, '', location.pathname + location.hash);
    return finishProviderSignIn(params);
  }

  function handleAction(action, event, ctx) {
    use(ctx);
    // What app.js asks for by name.
    if (action === 'welcome-start') { startWelcome(); return true; }
    if (action === 'welcome-open') { openWelcome(event.mode, { firstRun: event.firstRun }); return true; }
    if (action === 'welcome-submit') { welcomeSubmit(); return true; }
    if (action === 'welcome-provider-return') { finishProviderSignIn(event.params); return true; }
    if (action === 'welcome-dismiss') { dismissWelcome(); return true; }
    // The screen's own buttons, and "Prijavi se" / "Napravi nalog" on Nalog.
    const el = event?.target?.closest?.('[data-action]');
    if (action === 'open-welcome') openWelcome(el.dataset.mode);
    else if (action === 'welcome-mode') welcomeMode(el.dataset.mode);
    else if (action === 'welcome-skip') skipWelcome();
    else if (action === 'welcome-provider') startProviderSignIn(el.dataset.provider);
    else if (action === 'welcome-resend') welcomeResend();
    else if (action === 'welcome-toggle-password') toggleWelcomePassword();
    else return undefined;
    return true;
  }

  window.TodoDomainModules?.register({
    name: 'account',
    handleAction,
  });
})();
