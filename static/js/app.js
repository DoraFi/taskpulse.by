document.addEventListener('DOMContentLoaded', function() {
    const filterIcon = document.getElementById('filterIcon');
    const modal = document.getElementById('filterModal');
    const closeModal = document.getElementById('closeModal');

    filterIcon.addEventListener('click', () => {
        modal.classList.add('show');
    });

    closeModal.addEventListener('click', () => {
        modal.classList.remove('show');
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('show');
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('show')) {
            modal.classList.remove('show');
        }
    });

});