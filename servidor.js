require('dotenv').config();

const express = require('express');
const session = require('express-session');
const path = require('path');
const Groq = require('groq-sdk');

const app = express();

// ==========================================
// CONFIGURAÇÃO DA GROQ
// ==========================================

if (!process.env.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY não encontrada no arquivo .env');
}

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==========================================
// SESSÕES
// ==========================================

app.use(session({
    secret: process.env.SESSION_SECRET || 'torre-stark-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 600000 }
}));

const bancoUsuarios = [];

function verificarAutenticacao(req, res, next) {
    if (req.session && req.session.usuarioLogado) {
        return next();
    }

    res.redirect('/login.html');
}

app.use(express.static(path.join(__dirname, 'public'), {
    index: false
}));

// ==========================================
// 1. ROTAS DE NAVEGAÇÃO
// ==========================================

app.get(['/', '/index', '/index.html'], (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get(['/chat', '/chat.html'], verificarAutenticacao, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

app.get(['/cadastro', '/cadastro.html'], (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'cadastro.html'));
});

app.get(['/login', '/login.html'], (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// ==========================================
// 2. CHAT COM A GROQ
// ==========================================

app.post(['/enviar-mensagem', '/mensagem'], verificarAutenticacao, async (req, res) => {
    try {
        const { mensagem, historico } = req.body;
        const nomeUsuario = req.session.nomeUsuario || 'Visitante';

        const mensagensParaIA = [
            {
                role: 'system',
                content: `Você é Tony Stark, o Homem de Ferro. Converse com ${nomeUsuario}. Seja inteligente, sarcástico, divertido e amigável. Responda sempre em português de forma curta, direta e objetiva (no máximo 2 ou 3 frases).`
            }
        ];

        if (Array.isArray(historico)) {
            historico.forEach(item => {
                if (
                    item &&
                    ['user', 'assistant'].includes(item.role) &&
                    typeof item.content === 'string'
                ) {
                    mensagensParaIA.push({
                        role: item.role,
                        content: item.content
                    });
                }
            });
        }

        if (
            typeof mensagem === 'string' &&
            mensagem.trim() &&
            (
                mensagensParaIA[mensagensParaIA.length - 1]?.role !== 'user' ||
                mensagensParaIA[mensagensParaIA.length - 1]?.content !== mensagem
            )
        ) {
            mensagensParaIA.push({
                role: 'user',
                content: mensagem
            });
        }

        const chatCompletion = await groq.chat.completions.create({
            messages: mensagensParaIA,
            model: 'openai/gpt-oss-120b',
            temperature: 0.7,
            max_completion_tokens: 180
        });

        const respostaStark =
            chatCompletion.choices[0]?.message?.content ||
            'Meus sistemas estão operando com atraso. Pode repetir o comando?';

        res.json({ resposta: respostaStark });

    } catch (erro) {
        console.error('--- ERRO NA CHAMADA GROQ ---');
        console.error(erro.message || erro);
        console.error('----------------------------');

        res.status(500).json({
            erro: 'Falha na conexão com a inteligência da Torre Stark.'
        });
    }
});

// ==========================================
// 3. CADASTRO
// ==========================================

app.post(['/cadastro', '/api/cadastro'], (req, res) => {
    const { nome, email, senha } = req.body;

    if (!nome || !email || !senha) {
        return res.status(400).json({
            erro: 'Todos os campos são obrigatórios.'
        });
    }

    if (bancoUsuarios.some(u => u.email === email)) {
        return res.status(409).json({
            erro: 'Este email já está cadastrado.'
        });
    }

    bancoUsuarios.push({ nome, email, senha });

    req.session.usuarioLogado = true;
    req.session.nomeUsuario = nome;

    req.session.save((erro) => {
        if (erro) {
            console.error(erro);
            return res.status(500).json({
                erro: 'Erro ao iniciar sessão.'
            });
        }

        console.log(`NOVO CADASTRO: ${nome} | ${email}`);

        res.status(201).json({
            mensagem: 'Cadastro efetuado com sucesso!',
            usuario: nome
        });
    });
});

// ==========================================
// 4. LOGIN
// ==========================================

app.post(['/login', '/api/login'], (req, res) => {
    const { identificador, senha } = req.body;

    const usuarioValido = bancoUsuarios.find(
        u => u.nome === identificador || u.email === identificador
    );

    if (!usuarioValido || usuarioValido.senha !== senha) {
        return res.status(401).json({
            erro: 'Usuário ou senha incorretos.'
        });
    }

    req.session.usuarioLogado = true;
    req.session.nomeUsuario = usuarioValido.nome;

    req.session.save((erro) => {
        if (erro) {
            return res.status(500).json({
                erro: 'Erro ao salvar sessão no login.'
            });
        }

        res.status(200).json({
            mensagem: 'Login efetuado com sucesso!',
            usuario: usuarioValido.nome
        });
    });
});

// ==========================================
// 5. USUÁRIO E LOGOUT
// ==========================================

app.get('/api/meu-usuario', (req, res) => {
    if (req.session && req.session.usuarioLogado) {
        return res.json({
            logado: true,
            nome: req.session.nomeUsuario
        });
    }

    res.status(401).json({ logado: false });
});

app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login.html');
    });
});

// ==========================================
// 6. INICIAR SERVIDOR
// ==========================================

const PORT = 3000;

app.listen(PORT, () => {
    console.log('=========================================');
    console.log(`TORRE STARK ONLINE NA PORTA ${PORT}`);
    console.log('=========================================');
    console.log(`Cadastro: http://localhost:${PORT}/cadastro.html`);
    console.log(`Chat: http://localhost:${PORT}/chat.html`);
    console.log(`Login: http://localhost:${PORT}/login.html`);
});