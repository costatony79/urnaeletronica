const keys = document.querySelector('.teclado');
const display = document.querySelector('.displayUrna');
const audioTecla = new Audio('../sons/tecla.mp3');
const audioTeclaFim = new Audio('../sons/fim.mp3');

keys.addEventListener('click', e => {
 if (e.target.matches('button')) {
    const key = e.target;
    display.value = display.value + key.textContent; 
    audioTecla.play();
 }
});

function finalizaVoto(){
   audioTeclaFim.play();
}


function clearDisplay(){
    display.value = "";
 }
