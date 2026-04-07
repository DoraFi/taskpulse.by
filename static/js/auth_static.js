/**
 * Статическое поведение для экранов auth / onboarding.
 * Не мешает основному приложению: подключается только на страницах auth_*.html и onboarding_*.html
 */
(function () {
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
                window.alert('Укажите адрес электронной почты.');
                return;
            }
            window.alert('Ссылка для сброса пароля отправлена на ' + v + '.');
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

    // Лёгкий параллакс для блока приветствия (только если пользователь не просит меньше движения)
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
})();
