const socket = io();

const chatForm = document.getElementById('chatForm');
const messageInput = document.getElementById('messageInput');
const chatMessages = document.getElementById('chatMessages');

// Função para formatar a hora atual (HH:MM)
function obterHoraAtual() {
    const agora = new Date();
    return agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// Função para renderizar uma nova mensagem na tela
function adicionarMensagem(remetente, texto, tipo) {
    const msgBox = document.createElement('div');
    msgBox.classList.add('message-box', tipo); // tipo pode ser 'user' ou 'iron-man'

    msgBox.innerHTML = `
        <span class="sender-name">${remetente}</span>
        <p class="message-text">${texto}</p>
        <span class="message-time">${obterHoraAtual()}</span>
    `;

    chatMessages.appendChild(msgBox);
    // Rola o chat automaticamente para a última mensagem
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Escuta o envio do formulário
chatForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const mensagem = messageInput.value.trim();
    if (!mensagem) return;

    // 1. Adiciona a mensagem do usuário na tela localmente
    adicionarMensagem('Operador', mensagem, 'user');

    // 2. Transmite a mensagem para o servidor Node.js
    socket.emit('mensagemDoUsuario', mensagem);

    // Limpa o campo de entrada
    messageInput.value = '';
});

// Escuta as respostas que vêm do servidor (respostas do Homem de Ferro / Jarvis)
socket.on('respostaDoServidor', (dados) => {
    adicionarMensagem(dados.remetente, dados.texto, 'iron-man');
});
