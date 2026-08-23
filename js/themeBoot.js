(() => {
  try {
    const savedTheme = localStorage.getItem('pa5studio_theme');
    document.documentElement.dataset.theme = savedTheme === 'dark' ? 'dark' : 'light';
  } catch (_) {
    document.documentElement.dataset.theme = 'light';
  }
})();
