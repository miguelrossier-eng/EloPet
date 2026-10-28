const express = require('express');
const app = express();
const path = require('path');

// Permite que o servidor entenda JSON e dados enviados por formulários comuns
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORREÇÃO DE DIRETÓRIO: Serve todos os arquivos estáticos da pasta 'public'
app.use(express.static(path.join(__dirname, 'public')));

// Banco de dados temporário em memória para salvar os usuários cadastrados no sistema Stark
const bancoUsuarios = [];

// ==========================================
// 1. ROTAS DE NAVEGAÇÃO (ACEITA COM OU SEM .HTML)
// ==========================================

// Rota Inicial (http://localhost:3000 ou /index.html)
app.get(['/', '/index', '/index.html'], (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Rota do Chat (/chat ou /chat.html)
app.get(['/chat', '/chat.html'], (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

// Rota de Cadastro (/cadastro ou /cadastro.html)
app.get(['/cadastro', '/cadastro.html'], (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'cadastro.html'));
});

// Rota de Login (/login ou /login.html)
app.get(['/login', '/login.html'], (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});


// ==========================================
// 2. PROCESSAMENTO DO CHAT DO TONY STARK
// ==========================================

// Rota que o chat.js chama para enviar mensagens
app.post(['/enviar-mensagem', '/mensagem'], (req, res) => {
    try {
        const { mensagem } = req.body;

        let respostaTonyStark = "Estou um pouco ocupado refinando o reator arc agora. O que você precisa?";

        if (!mensagem) {
            respostaTonyStark = "Silêncio por aqui? Se precisar falar com o chefe, é só digitar.";
        } else if (mensagem.toLowerCase().includes('oi') || mensagem.toLowerCase().includes('olá')) {
            respostaTonyStark = "Olá! Aqui é o Tony Stark. O que o maior gênio do mundo pode fazer por você hoje?";
        } else if (mensagem.toLowerCase().includes('ajuda') || mensagem.toLowerCase().includes('armadura')) {
            respostaTonyStark = "Precisa de suporte com os sistemas de voo ou armas? Vou pedir para a Sexta-Feira rodar um diagnóstico completo.";
        } else if (mensagem.toLowerCase().includes('jarvis') || mensagem.toLowerCase().includes('sexta-feira') || mensagem.toLowerCase().includes('friday')) {
            respostaTonyStark = "Meus assistentes virtuais estão online. Eles cuidam da segurança da Torre Stark enquanto eu programo.";
        }

        res.json({ resposta: respostaTonyStark });
    } catch (erro) {
        res.status(500).json({ erro: "Erro interno no servidor" });
    }
});

// ==========================================
// 3. RECEBIMENTO DE CADASTRO E LOGIN INTEGRADOS
// ==========================================

// ROTA DE CADASTRO ADAPTADA
app.post(['/cadastro', '/api/cadastro'], (req, res) => {
    const { nome, email, senha } = req.body;

    // Validação básica de segurança
    if (!nome || !email || !senha) {
        return res.status(400).json({ erro: "Todos os campos são obrigatórios." });
    }

    // Salva o novo usuário na memória do servidor
    bancoUsuarios.push({ nome, email, senha });

    console.log("=========================================");
    console.log("NOVO REGISTRO ENCONTRADO:");
    console.log(`Nome: ${nome} | Email: ${email}`);
    console.log("=========================================");

    // Retorna mensagem com a chave esperada pelo seu front-end anterior
    res.status(201).json({ mensagem: "Cadastro efetuado com sucesso!" });
});

// ROTA DE LOGIN ADAPTADA COM VALIDAÇÃO REAL
app.post(['/login', '/api/login'], (req, res) => {
    const { identificador, senha } = req.body; // 'identificador' aceita tanto o nome de usuário quanto o e-mail

    // Procura o usuário que possua o nome ou email correspondente
    const usuarioValido = bancoUsuarios.find(u => u.nome === identificador || u.email === identificador);

    // Validação de Usuário
    if (!usuarioValido) {
        console.log(`[LOGIN NEGADO] Credencial não localizada: "${identificador}"`);
        return res.status(401).json({ erro: "Usuário não encontrado no sistema da Torre Stark." });
    }

    // Validação de Senha
    if (usuarioValido.senha !== senha) {
        console.log(`[LOGIN NEGADO] Senha incorreta para: "${usuarioValido.nome}"`);
        return res.status(401).json({ erro: "Senha incorreta. Acesso negado." });
    }

    // Sucesso
    console.log(`[LOGIN PERMITIDO] Usuário conectado: "${usuarioValido.nome}"`);
    res.status(200).json({ mensagem: "Login efetuado com sucesso!", usuario: usuarioValido.nome });
});

// Inicializa o servidor
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`  SISTEMAS DA TORRE STARK ONLINE NA PORTA ${PORT}   `);
    console.log(`====================================================`);
    console.log(`Acesse diretamente no navegador pelos links abaixo:`);
    console.log(`- Cadastro: http://localhost:${PORT}/cadastro.html`);
    console.log(`- Chat:     http://localhost:${PORT}/chat.html`);
    console.log(`- Login:    http://localhost:${PORT}/login.html`);
    console.log(`====================================================`);
});
