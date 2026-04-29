(function () {
    var REGISTER_DRAFT_KEY = 'tpRegisterDraft';
    var ONBOARDING_DRAFT_KEY = 'tpOnboardingDraft';
    var ACCOUNT_REGISTERED_KEY = 'tpAccountRegistered';
    var EMAIL_STRICT_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    document.querySelectorAll('form[data-static-form]').forEach(function (form) {
        form.addEventListener('submit', function (e) {
            e.preventDefault();
        });
    });

    var forgotBtn = document.getElementById('forgot-submit-btn');
    if (forgotBtn) {
        forgotBtn.addEventListener('click', function () {
            var input = document.getElementById('forgot-email');
            var v = input && input.value ? input.value.trim() : '';
            if (!v) {
                showToast('Укажите адрес электронной почты.');
                return;
            }
            showToast('Ссылка для сброса пароля отправлена на ' + v + '.');
        });
    }

    var addRow = document.getElementById('add-invite-row');
    if (addRow) {
        addRow.addEventListener('click', function () {
            var list = document.querySelector('.auth-team-list');
            if (!list) return;
            var first = list.querySelector('.auth-team-row');
            if (!first) return;
            var clone = first.cloneNode(true);
            clone.querySelectorAll('input, select').forEach(function (el) {
                el.value = '';
            });
            list.appendChild(clone);
        });
    }

    var registerContinueBtn = document.getElementById('registerContinueBtn');
    if (registerContinueBtn) {
        registerContinueBtn.addEventListener('click', async function () {
            var fullName = value('reg-name');
            var email = value('reg-email').toLowerCase();
            var password = value('reg-password');
            var password2 = value('reg-password2');
            var terms = document.querySelector('input[name="terms"]');
            var fullNameWords = fullName ? fullName.split(/\s+/).filter(Boolean) : [];
            var emailInput = document.getElementById('reg-email');
            var passOk = false;
            if (password) {
                // Требуем хотя бы 1 букву и 1 цифру
                passOk = /[A-Za-zА-Яа-яЁё]/.test(password) && /\d/.test(password) && password.length >= 8;
            }
            if (!fullName || !email || !password || !password2) {
                showToast('Заполните все обязательные поля.');
                return;
            }
            if (fullNameWords.length < 2) {
                showToast('Введите имя и фамилию (минимум 2 слова).');
                return;
            }
            if (emailInput && emailInput.checkValidity && !emailInput.checkValidity()) {
                showToast('Введите корректный email.');
                return;
            }
            if (!EMAIL_STRICT_RE.test(email)) {
                showToast('Введите email с доменом и точкой, например user@company.com.');
                return;
            }
            if (!passOk) {
                showToast('Пароль должен содержать буквы и цифры и быть длиной от 8 символов.');
                return;
            }
            if (password !== password2) {
                showToast('Пароли не совпадают.');
                return;
            }
            if (terms && !terms.checked) {
                showToast('Нужно принять условия использования.');
                return;
            }
            registerContinueBtn.disabled = true;
            try {
                var res = await fetch('/api/auth/register-account', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fullName: fullName, email: email, password: password })
                });
                var data = await res.json().catch(function () { return {}; });
                if (!res.ok) {
                    showToast(data.error || 'Не удалось зарегистрировать пользователя.');
                    return;
                }
                sessionStorage.setItem(REGISTER_DRAFT_KEY, JSON.stringify({
                    fullName: fullName,
                    email: email,
                    password: password
                }));
                sessionStorage.setItem(ACCOUNT_REGISTERED_KEY, '1');
                window.location.href = '/onboarding/org-team';
            } catch (e) {
                showToast('Ошибка сети. Попробуйте еще раз.');
            } finally {
                registerContinueBtn.disabled = false;
            }
        });

        // Разрешаем переход по Enter (submit формы), чтобы пользователь не “застревал”
        var registerForm = document.getElementById('registerForm');
        if (registerForm) {
            registerForm.addEventListener('submit', function (e) {
                e.preventDefault();
                registerContinueBtn.click();
            });
        }
    }

    var orgTeamNextBtn = document.getElementById('onboardingOrgTeamNextBtn');
    if (orgTeamNextBtn) {
        orgTeamNextBtn.addEventListener('click', function () {
            var registerDraft = readDraft(REGISTER_DRAFT_KEY);
            if (!registerDraft) {
                showToast('Сначала заполните данные регистрации.');
                window.location.href = '/auth/register';
                return;
            }

            var orgName = value('org-name');
            var teamName = value('team-name');
            if (!orgName || !teamName) {
                showToast('Заполните название организации и команды.');
                return;
            }

            var orgScope = value('org-scope');

            var existing = readDraft(ONBOARDING_DRAFT_KEY) || {};
            existing.organizationName = orgName;
            existing.teamName = teamName;
            existing.orgScope = orgScope || '';
            sessionStorage.setItem(ONBOARDING_DRAFT_KEY, JSON.stringify(existing));

            window.location.href = '/onboarding/project';
        });

        var orgTeamForm = orgTeamNextBtn.closest('form');
        if (orgTeamForm) {
            orgTeamForm.addEventListener('submit', function (e) {
                e.preventDefault();
                orgTeamNextBtn.click();
            });
        }
    }

    var projectNextBtn = document.getElementById('onboardingProjectNextBtn');
    if (projectNextBtn) {
        hydrateProjectDraft();
        projectNextBtn.addEventListener('click', function () {
            var registerDraft = readDraft(REGISTER_DRAFT_KEY);
            if (!registerDraft) {
                showToast('Сначала заполните данные регистрации.');
                window.location.href = '/auth/register';
                return;
            }
            var projectName = value('proj-name');
            var projectType = value('proj-template');
            var onboardingDraft = readDraft(ONBOARDING_DRAFT_KEY) || {};
            var orgName = onboardingDraft.organizationName;
            var teamName = onboardingDraft.teamName;

            if (!orgName || !teamName || !projectName) {
                showToast('Сначала заполните организацию и команду.');
                window.location.href = '/onboarding/org-team';
                return;
            }

            var rawKey = value('proj-key');
            var keyInput = rawKey ? String(rawKey).trim().toUpperCase() : '';
            var projectKey = keyInput;
            if (!projectKey) {
                projectKey = generateProjectKeyFromName(projectName);
                var keyEl = document.getElementById('proj-key');
                if (keyEl) keyEl.value = projectKey;
            }
            if (!/^[A-Z]{3}$/.test(projectKey)) {
                showToast('Ключ проекта должен состоять из 3 латинских букв.');
                return;
            }
            sessionStorage.setItem(ONBOARDING_DRAFT_KEY, JSON.stringify({
                organizationName: orgName,
                teamName: teamName,
                projectName: projectName,
                projectKey: projectKey,
                projectType: projectType || 'kanban',
                description: value('proj-desc')
            }));
            window.location.href = '/onboarding/team';
        });

        var projectForm = projectNextBtn.closest('form');
        if (projectForm) {
            projectForm.addEventListener('submit', function (e) {
                e.preventDefault();
                projectNextBtn.click();
            });
        }
    }

    var finishBtn = document.getElementById('onboardingTeamFinishBtn');
    if (finishBtn) {
        var skipTop = document.getElementById('onboardingTeamSkipTop');
        var skipLink = document.getElementById('onboardingTeamSkipLink');
        [skipTop, skipLink].forEach(function (el) {
            if (!el) return;
            el.addEventListener('click', function (e) {
                e.preventDefault();
                finishBtn.click();
            });
        });

        finishBtn.addEventListener('click', async function () {
            var registerDraft = readDraft(REGISTER_DRAFT_KEY);
            var onboardingDraft = readDraft(ONBOARDING_DRAFT_KEY);
            if (!registerDraft || !onboardingDraft) {
                showToast('Не удалось собрать данные регистрации. Начните заново.');
                window.location.href = '/auth/register';
                return;
            }
            var invites = collectInvites();
            var accountReady = sessionStorage.getItem(ACCOUNT_REGISTERED_KEY) === '1';
            var payload = accountReady ? {
                organizationName: onboardingDraft.organizationName,
                teamName: onboardingDraft.teamName,
                projectName: onboardingDraft.projectName,
                projectKey: onboardingDraft.projectKey,
                projectType: onboardingDraft.projectType,
                invites: invites
            } : {
                fullName: registerDraft.fullName,
                email: registerDraft.email,
                password: registerDraft.password,
                organizationName: onboardingDraft.organizationName,
                teamName: onboardingDraft.teamName,
                projectName: onboardingDraft.projectName,
                projectKey: onboardingDraft.projectKey,
                projectType: onboardingDraft.projectType,
                invites: invites
            };
            finishBtn.disabled = true;
            try {
                var res = await fetch(accountReady ? '/api/auth/complete-onboarding' : '/api/auth/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                var data = await res.json().catch(function () { return {}; });
                if (!res.ok) {
                    showToast(data.error || ('Не удалось завершить регистрацию. Код: ' + res.status));
                    return;
                }
                if (data && data.context && data.context.basePath) {
                    sessionStorage.setItem('tpOnboardingBasePath', String(data.context.basePath));
                }
                sessionStorage.removeItem(REGISTER_DRAFT_KEY);
                sessionStorage.removeItem(ONBOARDING_DRAFT_KEY);
                sessionStorage.removeItem(ACCOUNT_REGISTERED_KEY);
                window.location.href = '/onboarding/done';
            } catch (e) {
                showToast('Ошибка сети. Попробуйте еще раз.');
            } finally {
                finishBtn.disabled = false;
            }
        });

        var teamForm = finishBtn.closest('form');
        if (teamForm) {
            teamForm.addEventListener('submit', function (e) {
                e.preventDefault();
                finishBtn.click();
            });
        }
    }

    var loginBtn = document.getElementById('loginSubmitBtn');
    if (loginBtn) {
        loginBtn.addEventListener('click', async function () {
            var email = value('login-email').toLowerCase();
            var password = value('login-password');
            if (!email || !password) {
                showToast('Укажите email и пароль.');
                return;
            }
            loginBtn.disabled = true;
            try {
                var res = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: email, password: password })
                });
                var data = await res.json().catch(function () { return {}; });
                if (!res.ok) {
                    showToast(data.error || 'Неверный email или пароль.');
                    return;
                }
                var base = data.context && data.context.basePath ? data.context.basePath : '/';
                window.location.href = base;
            } catch (e) {
                showToast('Ошибка сети. Попробуйте еще раз.');
            } finally {
                loginBtn.disabled = false;
            }
        });

        var loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.addEventListener('submit', function (e) {
                e.preventDefault();
                loginBtn.click();
            });
        }
    }

    var root = document.querySelector('[data-auth-parallax-root]');
    if (root && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        var layers = root.querySelectorAll('[data-auth-parallax]');
        root.addEventListener('mousemove', function (e) {
            var rect = root.getBoundingClientRect();
            var px = (e.clientX - rect.left) / rect.width - 0.5;
            var py = (e.clientY - rect.top) / rect.height - 0.5;
            layers.forEach(function (el) {
                var k = parseFloat(el.getAttribute('data-auth-parallax'), 10) || 0.08;
                var tx = px * k * 40;
                var ty = py * k * 40;
                el.style.transform = 'translate(' + tx.toFixed(2) + 'px, ' + ty.toFixed(2) + 'px)';
            });
        });
        root.addEventListener('mouseleave', function () {
            layers.forEach(function (el) {
                el.style.transform = '';
            });
        });
    }

    function value(id) {
        var el = document.getElementById(id);
        return el && typeof el.value === 'string' ? el.value.trim() : '';
    }

    function readDraft(key) {
        try {
            var raw = sessionStorage.getItem(key);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    }

    function collectInvites() {
        var rows = Array.from(document.querySelectorAll('.auth-team-row'));
        var emailLike = function (v) {
            return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());
        };

        var invalidEmails = [];
        var invites = rows.map(function (row) {
            var emailInput = row.querySelector('input[type="email"]');
            var roleSelect = row.querySelector('select');
            var role = roleSelect ? String(roleSelect.value || 'member') : 'member';
            if (role === 'admin') role = 'team_admin';
            if (role === 'viewer') role = 'observer';
            if (role !== 'team_admin' && role !== 'observer') role = 'member';
            var email = emailInput ? String(emailInput.value || '').trim().toLowerCase() : '';
            if (email && !emailLike(email)) {
                invalidEmails.push(email);
                return null;
            }
            return {
                email: emailInput ? String(emailInput.value || '').trim().toLowerCase() : '',
                role: role
            };
        }).filter(function (i) { return i && i.email && i.email.length > 0; });

        if (invalidEmails.length > 0) {
            // Не блокируем регистрацию, просто игнорируем неверные email.
            showToast('Некоторые email для приглашений некорректны и будут пропущены.');
        }
        return invites;
    }

    function hydrateProjectDraft() {
        var draft = readDraft(ONBOARDING_DRAFT_KEY);
        if (!draft) return;
        var org = document.getElementById('org-name');
        var team = document.getElementById('team-name');
        var project = document.getElementById('proj-name');
        var key = document.getElementById('proj-key');
        var type = document.getElementById('proj-template');
        var desc = document.getElementById('proj-desc');
        if (org && draft.organizationName) org.value = draft.organizationName;
        if (team && draft.teamName) team.value = draft.teamName;
        if (project && draft.projectName) project.value = draft.projectName;
        if (key && draft.projectKey) key.value = draft.projectKey;
        if (type && draft.projectType) type.value = draft.projectType;
        if (desc && draft.description) desc.value = draft.description;
        var typeDisplay = document.getElementById('proj-template-display');
        if (typeDisplay && type) {
            var labels = { list: 'Список', kanban: 'Kanban', scrum: 'Scrum', scrumban: 'Scrumban' };
            typeDisplay.value = labels[type.value] || type.value;
        }
    }

    function showToast(message) {
        if (!message) return;
        if (typeof window.showToast === 'function') {
            window.showToast(message);
            return;
        }
        var toast = document.createElement('div');
        toast.className = 'toast-notification';
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(function () { toast.classList.add('show'); }, 10);
        setTimeout(function () {
            toast.classList.remove('show');
            setTimeout(function () { toast.remove(); }, 300);
        }, 2300);
    }

    function generateProjectKeyFromName(name) {
        if (!name) return '';
        var src = String(name).trim();
        if (!src) return '';

        var translit = src.toLowerCase()
            .replace(/ё/g, 'e')
            .replace(/а/g, 'a')
            .replace(/б/g, 'b')
            .replace(/в/g, 'v')
            .replace(/г/g, 'g')
            .replace(/д/g, 'd')
            .replace(/е/g, 'e')
            .replace(/ж/g, 'zh')
            .replace(/з/g, 'z')
            .replace(/и/g, 'i')
            .replace(/й/g, 'y')
            .replace(/к/g, 'k')
            .replace(/л/g, 'l')
            .replace(/м/g, 'm')
            .replace(/н/g, 'n')
            .replace(/о/g, 'o')
            .replace(/п/g, 'p')
            .replace(/р/g, 'r')
            .replace(/с/g, 's')
            .replace(/т/g, 't')
            .replace(/у/g, 'u')
            .replace(/ф/g, 'f')
            .replace(/х/g, 'h')
            .replace(/ц/g, 'ts')
            .replace(/ч/g, 'ch')
            .replace(/ш/g, 'sh')
            .replace(/щ/g, 'sh')
            .replace(/ы/g, 'y')
            .replace(/э/g, 'e')
            .replace(/ю/g, 'yu')
            .replace(/я/g, 'ya');

        var lettersOnly = translit.replace(/[^a-z]/g, '');
        var key = lettersOnly.slice(0, 3).toUpperCase();
        while (key.length < 3) key = key + 'X';
        return key.slice(0, 3);
    }
})();
