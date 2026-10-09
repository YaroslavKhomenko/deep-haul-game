// Карточка старта на чистом сохранении: что делать и как управлять, без разбора всей меты.
export function showIntro(onStart: () => void): void {
  const overlay = document.getElementById('overlay')!;
  const el = document.createElement('div');
  el.className = 'modal intro';
  el.id = 'intro-modal';
  el.innerHTML = `
    <h2>Deep Haul</h2>
    <p>Вы — дайвер у причала затопленной пещеры. От светлой площадки вниз ведёт узкая шахта.</p>
    <ul>
      <li><b>Плывите вниз</b> и светите фонарём: пещера тёмная, видно только рядом с вами.</li>
      <li><b>Собирайте находки</b> у стен и в нишах. Каждый предмет добавляет вес и замедляет.</li>
      <li><b>Следите за кислородом</b> и возвращайтесь на светлую площадку причала — стрелка подскажет дорогу.</li>
      <li><b>Сбрасывайте лишнее</b>: с перегрузом дайвер едва движется.</li>
    </ul>
    <table class="keys">
      <tr><td>WASD / стрелки</td><td>плыть</td></tr>
      <tr><td>E</td><td>взять находку</td></tr>
      <tr><td>Q</td><td>сбросить последний предмет</td></tr>
      <tr><td>Esc</td><td>пауза</td></tr>
    </table>
    <div class="row"><button id="intro-start" class="primary">Нырнуть</button></div>`;
  overlay.appendChild(el);
  const start = () => {
    el.remove();
    window.removeEventListener('keydown', onKey);
    onStart();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.code === 'Enter' || e.code === 'Space') {
      e.preventDefault();
      start();
    }
  };
  el.querySelector('#intro-start')!.addEventListener('click', start);
  window.addEventListener('keydown', onKey);
}
