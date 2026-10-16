(function () {
  'use strict';
  const I18n = window.TodoI18n;
  const { tr, trMessage, msg } = I18n;
  const Sync = window.DailoSync || null;
  const TodoStorage = window.TodoStorage;

  // The account, a module since R112 (plan part 3a): the welcome screen and sign-in; since R113 (3b) also the account
  // windows (the password, the e-mail address and the journal password), and since R114 (3c) finishing a sign-in,
  // "Odjavi se", deleting the account and the first-sync choice. Their markup is in js/settings-ui.js; the journal key
  // and the sync itself stay in app.js. app.js asks this module by name (accountAction) at start, when a form is sent,
  // when Google or Apple returns to the app, to put the screen away and when the first sync finds data on both sides.
  // The app's helpers come from the first domain context the module receives; the live data, the open window, the
  // device's sync record, the return focus, the start-up flags, whether a sync is running and the sync's timer are read
  // through it each time (app.*).
  let app = null;
  let syncClient, loadSyncMeta, saveSyncMeta, runSync, captureModalReturnFocus, restoreModalReturnFocus, closePopover, renderModal, render, setToastMessage, $, nowIso, storeJournalKey, forgetJournalKey, scheduleSync, journalCipherStatus, saveState, liveSync, SYNC_META_KEY, plainWord, openConfirm, modalFrame, navigate;
  function use(ctx) {
    if (app) return;
    app = ctx;
    ({ syncClient, loadSyncMeta, saveSyncMeta, runSync, captureModalReturnFocus, restoreModalReturnFocus, closePopover, renderModal, render, setToastMessage, $, nowIso, storeJournalKey, forgetJournalKey, scheduleSync, journalCipherStatus, saveState, liveSync, SYNC_META_KEY, plainWord, openConfirm, modalFrame, navigate } = ctx);
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

  // R43: Nalog → "Promeni lozinku" and "Promeni e-adresu", each a sheet with a form. The password step may turn into
  // the current password or a code the server e-mails; the new address is confirmed by its code (and, with secure
  // e-mail change on the server, by one sent to the current address).
  function openAccountWindow(kind) {
    const session = loadSyncMeta().session;
    if (!syncClient || !session?.accessToken || app.modalState) return;
    captureModalReturnFocus(); closePopover();
    app.setModalState({ type: kind === 'email' ? 'account-email' : 'account-password', step: kind === 'email' ? 'email' : 'new', currentEmail: session.user?.email || '',
      password: '', confirm: '', current: '', code: '', email: '', pending: false, busy: false, error: '' });
    renderModal();
  }

  function setAccountWindow(changes) {
    if (!['account-password', 'account-email'].includes(app.modalState?.type)) return;
    app.setModalState({ ...app.modalState, ...changes });
    renderModal();
  }

  function accountFields() {
    const windowState = app.modalState;
    for (const [key, id] of [['password', 'account-password'], ['confirm', 'account-password-confirm'], ['current', 'account-current'], ['code', 'account-code'], ['email', 'account-email']]) {
      const field = $(`#${id}`);
      if (field) windowState[key] = ['code', 'email'].includes(key) ? String(field.value ?? '').trim() : String(field.value ?? '');
    }
    return windowState;
  }

  // The session for an account change, refreshed and stored when it was about to expire.
  async function currentSession() {
    const meta = loadSyncMeta();
    const session = await syncClient.ensureSession(meta.session);
    if (session !== meta.session) { app.setSyncMeta({ ...meta, session }); saveSyncMeta(); }
    return session;
  }

  function closeAccountWindow(message) {
    app.setModalState(null);
    renderModal();
    const target = app.modalReturnFocus;
    app.setModalReturnFocus(null);
    if (target) restoreModalReturnFocus(target);
    render();
    setToastMessage(message);
  }

  async function accountSubmit() {
    if (app.modalState?.type === 'journal-cipher') return journalCipherSubmit();
    if (!syncClient || !['account-password', 'account-email'].includes(app.modalState?.type) || app.modalState.busy) return;
    const windowState = accountFields();
    return windowState.type === 'account-password' ? accountPasswordSubmit(windowState) : accountEmailSubmit(windowState);
  }

  async function accountPasswordSubmit(windowState) {
    const code = windowState.code.replace(/\s+/g, '');
    const problem = Sync.passwordProblem(windowState.password) || (windowState.confirm !== windowState.password ? msg('The passwords do not match.') : '')
      || (windowState.step === 'current' && !windowState.current ? msg('Enter your password.') : '')
      || (windowState.step === 'nonce' && !/^\d{6,10}$/.test(code) ? msg('Enter the code from the e-mail.') : '');
    if (problem) { setAccountWindow({ error: problem }); return; }
    setAccountWindow({ busy: true, error: '' });
    let session;
    try {
      session = await currentSession();
      await syncClient.updatePassword(session, windowState.password, { nonce: windowState.step === 'nonce' ? code : '', currentPassword: windowState.step === 'current' ? windowState.current : '' });
      closeAccountWindow(tr('Password changed. Other devices will sign in again.'));
    } catch (error) {
      if (error?.reason === 'reauthentication_needed') {
        try { await syncClient.reauthenticate(session); setAccountWindow({ step: 'nonce', code: '', busy: false }); }
        catch (sent) { setAccountWindow({ busy: false, error: sent?.message || String(sent) }); }
      } else if (error?.reason === 'current_password_required') setAccountWindow({ step: 'current', busy: false });
      else setAccountWindow({ busy: false, error: error?.message || String(error) });
    }
  }

  async function accountEmailSubmit(windowState) {
    if (windowState.step === 'email') {
      const email = windowState.email;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setAccountWindow({ error: msg('Enter a valid e-mail address.') }); return; }
      if (email.toLowerCase() === windowState.currentEmail.toLowerCase()) { setAccountWindow({ error: msg('This is already your e-mail address.') }); return; }
      setAccountWindow({ busy: true, error: '' });
      try {
        await syncClient.changeEmail(await currentSession(), email);
        setAccountWindow({ step: 'code', code: '', pending: false, busy: false });
      } catch (error) {
        setAccountWindow({ busy: false, error: error?.reason === 'email_exists' ? msg('Another account already uses this e-mail address.') : error?.message || String(error) });
      }
      return;
    }
    const code = windowState.code.replace(/\s+/g, '');
    if (!/^\d{6,10}$/.test(code)) { setAccountWindow({ error: msg('Enter the code from the e-mail.') }); return; }
    setAccountWindow({ busy: true, error: '' });
    // The code may come from the new address or, with secure e-mail change, from the current one.
    let result = null;
    let failure = null;
    for (const address of [windowState.email, windowState.currentEmail]) {
      try { result = await syncClient.verifyEmailChange(address, code); break; }
      catch (error) { failure = error; if (!(error?.status >= 400 && error?.status < 500) || error.status === 429) break; }
    }
    if (!result) {
      setAccountWindow({ busy: false, error: failure?.status === 429 || !(failure?.status >= 400) ? failure?.message || String(failure) : msg('The code is wrong or has expired.') });
      return;
    }
    if (result.pending) { setAccountWindow({ busy: false, pending: true, code: '' }); return; }
    completeSignIn(result.session);
    closeAccountWindow(tr('E-mail address changed: {email}', { email: result.session.user.email }));
  }

  function openJournalCipherWindow(mode) {
    const status = journalCipherStatus();
    const allowed = { enable: 'off', unlock: 'locked', disable: 'on' };
    if (!syncClient || !loadSyncMeta().session?.accessToken || app.modalState || allowed[mode] !== status) return;
    captureModalReturnFocus(); closePopover();
    app.setModalState({ type: 'journal-cipher', mode, password: '', confirm: '', busy: false, error: '' });
    renderModal();
  }

  function setJournalWindow(changes) {
    if (app.modalState?.type !== 'journal-cipher') return;
    app.setModalState({ ...app.modalState, ...changes });
    renderModal();
  }

  async function journalCipherSubmit() {
    if (app.modalState?.type !== 'journal-cipher' || app.modalState.busy) return;
    const windowState = app.modalState;
    windowState.password = String($('#journal-password')?.value ?? windowState.password);
    windowState.confirm = String($('#journal-password-confirm')?.value ?? windowState.confirm);
    if (windowState.mode === 'enable') {
      const problem = Sync.passwordProblem(windowState.password);
      if (problem) { setJournalWindow({ error: problem }); return; }
      if (windowState.password !== windowState.confirm) { setJournalWindow({ error: msg('The passwords do not match.') }); return; }
    }
    setJournalWindow({ busy: true, error: '' });
    if (app.syncRunning) { setJournalWindow({ busy: false, error: msg('Sync is running. Try again in a moment.') }); return; }
    const meta = loadSyncMeta();
    let message;
    try {
      if (windowState.mode === 'enable') {
        const { cipher, key } = await Sync.createJournalCipher(windowState.password);
        app.state.settings.journalCipher = cipher;
        if (!saveState()) { delete app.state.settings.journalCipher; throw new Error(msg('Changes could not be saved locally. Try again.')); }
        await storeJournalKey(cipher.salt, key);
        // Every entry goes again, sealed; then the readable versions leave the server history.
        Sync.forgetJournalShadow(meta);
        meta.purgeJournalHistory = true;
        message = tr('The journal is encrypted. The server sees only ciphertext.');
      } else if (windowState.mode === 'unlock') {
        const key = await Sync.unlockJournalCipher(app.state.settings.journalCipher, windowState.password);
        if (!key) { setJournalWindow({ busy: false, error: msg('The journal password is wrong.') }); return; }
        await storeJournalKey(app.state.settings.journalCipher.salt, key);
        // The next pull fetches the sealed entries this device left out while it was locked.
        meta.cursor = null;
        message = tr('The journal is unlocked on this device.');
      } else {
        delete app.state.settings.journalCipher;
        if (!saveState()) throw new Error(msg('Changes could not be saved locally. Try again.'));
        forgetJournalKey();
        // Every entry goes again, readable.
        Sync.forgetJournalShadow(meta);
        delete meta.purgeJournalHistory; delete meta.journalPurgeError;
        message = tr('Journal encryption is off.');
      }
    } catch (error) { setJournalWindow({ busy: false, error: error.message }); return; }
    app.setSyncMeta(meta);
    saveSyncMeta();
    closeAccountWindow(message);
    scheduleSync(300);
  }

  // The shadow describes one account; another account on this device starts again with the first-sync choice.
  function completeSignIn(session) {
    const previous = loadSyncMeta();
    app.setSyncMeta(previous.userId === session.user.id ? { ...previous, session, lastError: null } : { userId: session.user.id, session });
    delete app.syncMeta.pkce;
    saveSyncMeta();
  }

  // R114: signing out, deleting the account and the first-sync choice, from app.js.
  async function signOutSync() {
    const meta = loadSyncMeta();
    clearTimeout(app.syncTimer);
    liveSync?.disconnect();
    forgetJournalKey();
    app.setSyncMeta({});
    try { localStorage.removeItem(SYNC_META_KEY); } catch (error) { console.error(error); }
    render();
    if (meta.session && syncClient) await syncClient.signOut(meta.session);
  }

  // R64: "Odjavi se" returns to the first screen, Danas behind the sign-in screen, to sign in again or go on without
  // an account. The session ends on this device at once; the server is told meanwhile, so a slow network holds nothing.
  function signOutToWelcome() {
    const done = signOutSync();
    navigate('today');
    openWelcome('sign-in', { firstRun: true });
    return done;
  }

  function deleteSyncAccount() {
    const word = 'OBRIŠI';
    openConfirm({ title: msg('Delete your sync account?'), message: msg('This deletes your account and all synced data on the server. Data on this device stays.'),
      phrase: word, confirmLabel: msg('Delete account'),
      onConfirm: async () => {
        if (plainWord($('#global-confirm-phrase')?.value) !== plainWord(word)) { setToastMessage(tr('Type {word} exactly to continue.', { word })); return; }
        app.setModalState(null); renderModal();
        try { await syncClient.deleteAccount(await syncClient.ensureSession(loadSyncMeta().session)); }
        catch (error) { setToastMessage(tr('The account could not be deleted: {error}', { error: trMessage(error.message) })); return; }
        clearTimeout(app.syncTimer);
        liveSync?.disconnect();
        forgetJournalKey();
        app.setSyncMeta({});
        try { localStorage.removeItem(SYNC_META_KEY); } catch (error) { console.error(error); }
        render();
        setToastMessage(tr('The account and its synced data were deleted. Data on this device stays.'));
      } });
  }

  // First sync on a device when both the device and the account have data.
  function openSyncChoice() {
    if (app.modalState) return; // The next sync asks again.
    captureModalReturnFocus(); closePopover();
    app.setModalState({ type: 'sync-choice', onCancel: async () => { app.setModalState(null); renderModal(); await signOutSync(); } });
    renderModal();
  }

  function renderSyncChoice() {
    const option = (mode, title, copy) => `<button class="sync-choice-option" type="button" data-action="sync-choose" data-mode="${mode}"><strong>${title}</strong><span>${copy}</span></button>`;
    return modalFrame(`<div class="modal-inner"><div class="modal-header"><h2 class="modal-title">${tr('Data on this device and in your account')}</h2><button class="btn-icon" type="button" data-action="close-modal" aria-label="${tr('Close dialog')}"><i class="ph ph-x"></i></button></div>
      <p class="dialog-copy">${tr('This device and your account both have data. Choose what to keep. A local recovery copy is made first.')}</p>
      ${option('merge', tr('Merge'), tr('Keep everything. When an item was changed in both places, the newer change wins.'))}
      ${option('server', tr('Keep the account data'), tr('This device gets the data from your account. Items that exist only on this device are removed.'))}
      ${option('device', tr('Keep this device’s data'), tr('Your account gets the data from this device. Items that exist only in the account are removed.'))}
      <div class="modal-footer"><span></span><div class="modal-footer-actions"><button class="btn btn-ghost" type="button" data-action="close-modal">${tr('Cancel and sign out')}</button></div></div></div>`);
  }

  async function chooseSyncMode(mode) {
    if (!['merge', 'server', 'device'].includes(mode) || app.modalState?.type !== 'sync-choice') return;
    app.setModalState(null); renderModal();
    try { await TodoStorage.createAutomaticSnapshot(app.state, new Date(), { force: true }); }
    catch (error) { setToastMessage(tr('Sync did not start because the recovery copy failed: {error}', { error: trMessage(error.message) })); return; }
    await runSync(mode);
  }

  function renderRoute(route, ctx) {
    use(ctx);
    if (route?.type === 'modal' && route.modalType === 'sync-choice') return renderSyncChoice();
    return undefined;
  }

  function handleAction(action, event, ctx) {
    use(ctx);
    // What app.js asks for by name.
    if (action === 'welcome-start') { startWelcome(); return true; }
    if (action === 'welcome-submit') { welcomeSubmit(); return true; }
    if (action === 'welcome-provider-return') { finishProviderSignIn(event.params); return true; }
    if (action === 'welcome-dismiss') { dismissWelcome(); return true; }
    if (action === 'account-submit') { accountSubmit(); return true; }
    if (action === 'sync-choice-open') { openSyncChoice(); return true; }
    // The screens' own buttons, and Nalog's "Prijavi se", "Napravi nalog", the account changes and the journal password;
    // since R114 also "Odjavi se", deleting the account and the first-sync choice.
    const el = event?.target?.closest?.('[data-action]');
    if (action === 'open-welcome') openWelcome(el.dataset.mode);
    else if (action === 'welcome-mode') welcomeMode(el.dataset.mode);
    else if (action === 'welcome-skip') skipWelcome();
    else if (action === 'welcome-provider') startProviderSignIn(el.dataset.provider);
    else if (action === 'welcome-resend') welcomeResend();
    else if (action === 'welcome-toggle-password') toggleWelcomePassword();
    else if (action === 'account-change-password') openAccountWindow('password');
    else if (action === 'account-change-email') openAccountWindow('email');
    else if (['journal-cipher-enable', 'journal-cipher-unlock', 'journal-cipher-disable'].includes(action)) openJournalCipherWindow(action.slice('journal-cipher-'.length));
    else if (action === 'sync-sign-out') signOutToWelcome();
    else if (action === 'sync-delete-account') deleteSyncAccount();
    else if (action === 'sync-choose') chooseSyncMode(el.dataset.mode);
    else return undefined;
    return true;
  }

  window.TodoDomainModules?.register({
    name: 'account',
    renderRoute,
    handleAction,
  });
})();
