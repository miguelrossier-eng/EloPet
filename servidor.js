require('dotenv').config();

const express = require('express');
const session = require('express-session');
const connectMongo = require('connect-mongo');
const MongoStore = connectMongo.MongoStore || connectMongo.default || connectMongo;
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const path = require('path');
const Groq = require('groq-sdk');

const app = express();

// ==========================================
// VARIÁVEIS DE AMBIENTE
// ==========================================

if (!process.env.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY não encontrada no arquivo .env');
}

if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI não encontrada no arquivo .env');
}

const EM_PRODUCAO = process.env.NODE_ENV === 'production';

if (EM_PRODUCAO && !process.env.SESSION_SECRET) {
    throw new Error('Defina SESSION_SECRET nas variáveis de ambiente do Render.');
}

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

// ==========================================
// BANCO DE DADOS (MongoDB)
// ==========================================

const usuarioSchema = new mongoose.Schema({
    nome:     { type: String, required: true, trim: true, minlength: 2, maxlength: 30 },
    email:    { type: String, required: true, unique: true, lowercase: true, trim: true },
    senha:    { type: String, required: true }, // guarda o HASH, nunca a senha pura
    bio:      { type: String, default: '', maxlength: 160 },
    cidade:   { type: String, default: '', maxlength: 40 },
    avatar:   { type: String, default: '' },          // foto em base64 (reduzida no navegador)
    banner:   { type: String, default: 'vermelho' },  // tema do banner
    criadoEm: { type: Date, default: Date.now }
});

const Usuario = mongoose.model('Usuario', usuarioSchema);

const postSchema = new mongoose.Schema({
    autor:    { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true, index: true },
    texto:    { type: String, required: true, trim: true, maxlength: 280 },
    criadoEm: { type: Date, default: Date.now }
});

const Post = mongoose.model('Post', postSchema);

// ==========================================
// MIDDLEWARES
// ==========================================

// O Render fica atrás de um proxy HTTPS; necessário para o cookie seguro funcionar
app.set('trust proxy', 1);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: process.env.SESSION_SECRET || 'torre-stark-secret-local',
    resave: false,
    saveUninitialized: false,
    // Sessões ficam no MongoDB: não se perdem quando o Render reinicia
    store: MongoStore.create({
        mongoUrl: process.env.MONGODB_URI,
        collectionName: 'sessoes'
    }),
    cookie: {
        maxAge: 1000 * 60 * 60 * 24, // 1 dia
        httpOnly: true,
        sameSite: 'lax',
        secure: EM_PRODUCAO
    }
}));

// Para páginas: manda para o login
function verificarAutenticacao(req, res, next) {
    if (req.session && req.session.userId) {
        return next();
    }

    res.redirect('/login.html');
}

// Para rotas de API: responde 401 em JSON
function verificarApi(req, res, next) {
    if (req.session && req.session.userId) {
        return next();
    }

    res.status(401).json({ erro: 'Não autenticado.' });
}

function iniciarSessao(req, usuario) {
    req.session.userId = usuario._id.toString();
    req.session.usuarioLogado = true;
    req.session.nomeUsuario = usuario.nome;
}

// ==========================================
// 1. ROTAS DE NAVEGAÇÃO
// (antes do express.static, para as páginas protegidas realmente exigirem login)
// ==========================================

app.get(['/', '/index', '/index.html'], (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get(['/chat', '/chat.html'], verificarAutenticacao, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

app.get(['/perfil', '/perfil.html'], verificarAutenticacao, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'perfil.html'));
});

app.get(['/cadastro', '/cadastro.html'], (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'cadastro.html'));
});

app.get(['/login', '/login.html'], (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.use(express.static(path.join(__dirname, 'public'), {
    index: false
}));

// ==========================================
// 2. CHAT COM A GROQ
// ==========================================

app.post(['/enviar-mensagem', '/mensagem'], verificarApi, async (req, res) => {
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

app.post(['/cadastro', '/api/cadastro'], async (req, res) => {
    try {
        const nome = String(req.body.nome || '').trim();
        const email = String(req.body.email || '').trim().toLowerCase();
        const senha = String(req.body.senha || '');

        if (!nome || !email || !senha) {
            return res.status(400).json({ erro: 'Todos os campos são obrigatórios.' });
        }

        if (nome.length < 2 || nome.length > 30) {
            return res.status(400).json({ erro: 'O nome deve ter entre 2 e 30 caracteres.' });
        }

        if (senha.length < 6) {
            return res.status(400).json({ erro: 'A senha deve ter pelo menos 6 caracteres.' });
        }

        if (await Usuario.findOne({ email })) {
            return res.status(409).json({ erro: 'Este email já está cadastrado.' });
        }

        const senhaHash = await bcrypt.hash(senha, 10);
        const usuario = await Usuario.create({ nome, email, senha: senhaHash });

        iniciarSessao(req, usuario);

        req.session.save((erro) => {
            if (erro) {
                console.error(erro);
                return res.status(500).json({ erro: 'Erro ao iniciar sessão.' });
            }

            console.log(`NOVO CADASTRO: ${nome} | ${email}`);

            res.status(201).json({
                mensagem: 'Cadastro efetuado com sucesso!',
                usuario: usuario.nome
            });
        });

    } catch (erro) {
        console.error('Erro no cadastro:', erro);

        if (erro.code === 11000) {
            return res.status(409).json({ erro: 'Este email já está cadastrado.' });
        }

        res.status(500).json({ erro: 'Erro interno ao cadastrar.' });
    }
});

// ==========================================
// 4. LOGIN
// ==========================================

app.post(['/login', '/api/login'], async (req, res) => {
    try {
        const identificador = String(req.body.identificador || '').trim();
        const senha = String(req.body.senha || '');

        // Nomes podem se repetir: testa a senha em cada conta encontrada
        const candidatos = await Usuario.find({
            $or: [{ email: identificador.toLowerCase() }, { nome: identificador }]
        });

        let usuario = null;
        for (const candidato of candidatos) {
            if (await bcrypt.compare(senha, candidato.senha)) {
                usuario = candidato;
                break;
            }
        }

        if (!usuario) {
            return res.status(401).json({ erro: 'Usuário ou senha incorretos.' });
        }

        iniciarSessao(req, usuario);

        req.session.save((erro) => {
            if (erro) {
                return res.status(500).json({ erro: 'Erro ao salvar sessão no login.' });
            }

            res.status(200).json({
                mensagem: 'Login efetuado com sucesso!',
                usuario: usuario.nome
            });
        });

    } catch (erro) {
        console.error('Erro no login:', erro);
        res.status(500).json({ erro: 'Erro interno ao entrar.' });
    }
});

// ==========================================
// 5. USUÁRIO, PERFIL E LOGOUT
// ==========================================

app.get('/api/meu-usuario', async (req, res) => {
    try {
        if (!req.session || !req.session.userId) {
            return res.status(401).json({ logado: false });
        }

        const usuario = await Usuario.findById(req.session.userId).select('-senha');

        if (!usuario) {
            // usuário apagado do banco: encerra a sessão
            return req.session.destroy(() => res.status(401).json({ logado: false }));
        }

        const totalPosts = await Post.countDocuments({ autor: usuario._id });

        res.json({
            logado: true,
            nome: usuario.nome,
            email: usuario.email,
            bio: usuario.bio,
            cidade: usuario.cidade,
            avatar: usuario.avatar,
            banner: usuario.banner,
            totalPosts,
            criadoEm: usuario.criadoEm
        });

    } catch (erro) {
        console.error('Erro em /api/meu-usuario:', erro);
        res.status(500).json({ logado: false });
    }
});

// ------------------------------------------
// PERFIL
// ------------------------------------------

const BANNERS_VALIDOS = ['vermelho', 'ciano', 'dourado', 'roxo', 'verde', 'noite'];
const LIMITE_AVATAR = 300000; // tamanho máximo do texto base64 da foto

app.put('/api/perfil', verificarApi, async (req, res) => {
    try {
        const usuario = await Usuario.findById(req.session.userId);

        if (!usuario) {
            return res.status(404).json({ erro: 'Usuário não encontrado.' });
        }

        const { nome, bio, cidade, banner, avatar } = req.body;

        if (typeof nome === 'string') {
            const n = nome.trim();
            if (n.length < 2 || n.length > 30) {
                return res.status(400).json({ erro: 'O nome deve ter entre 2 e 30 caracteres.' });
            }
            usuario.nome = n;
        }

        if (typeof bio === 'string') {
            const b = bio.trim();
            if (b.length > 160) {
                return res.status(400).json({ erro: 'A bio pode ter no máximo 160 caracteres.' });
            }
            usuario.bio = b;
        }

        if (typeof cidade === 'string') {
            const c = cidade.trim();
            if (c.length > 40) {
                return res.status(400).json({ erro: 'A cidade pode ter no máximo 40 caracteres.' });
            }
            usuario.cidade = c;
        }

        if (typeof banner === 'string') {
            if (!BANNERS_VALIDOS.includes(banner)) {
                return res.status(400).json({ erro: 'Banner inválido.' });
            }
            usuario.banner = banner;
        }

        if (typeof avatar === 'string') {
            if (avatar === '') {
                usuario.avatar = ''; // remover foto
            } else if (
                avatar.length <= LIMITE_AVATAR &&
                /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(avatar)
            ) {
                usuario.avatar = avatar;
            } else {
                return res.status(400).json({ erro: 'Imagem inválida ou grande demais.' });
            }
        }

        await usuario.save();

        req.session.nomeUsuario = usuario.nome;

        req.session.save(() => {
            res.json({ mensagem: 'Perfil atualizado!' });
        });

    } catch (erro) {
        console.error('Erro ao atualizar perfil:', erro);
        res.status(500).json({ erro: 'Erro interno ao salvar o perfil.' });
    }
});

// Trocar a própria senha
app.put('/api/senha', verificarApi, async (req, res) => {
    try {
        const senhaAtual = String(req.body.senhaAtual || '');
        const novaSenha = String(req.body.novaSenha || '');

        if (novaSenha.length < 6) {
            return res.status(400).json({ erro: 'A nova senha deve ter pelo menos 6 caracteres.' });
        }

        const usuario = await Usuario.findById(req.session.userId);

        if (!usuario) {
            return res.status(404).json({ erro: 'Usuário não encontrado.' });
        }

        if (!(await bcrypt.compare(senhaAtual, usuario.senha))) {
            return res.status(403).json({ erro: 'Senha atual incorreta.' });
        }

        usuario.senha = await bcrypt.hash(novaSenha, 10);
        await usuario.save();

        res.json({ mensagem: 'Senha alterada com sucesso!' });

    } catch (erro) {
        console.error('Erro ao trocar senha:', erro);
        res.status(500).json({ erro: 'Erro interno ao trocar a senha.' });
    }
});

// Excluir a própria conta (pede a senha)
app.delete('/api/conta', verificarApi, async (req, res) => {
    try {
        const senha = String(req.body.senha || '');
        const usuario = await Usuario.findById(req.session.userId);

        if (!usuario) {
            return res.status(404).json({ erro: 'Usuário não encontrado.' });
        }

        if (!(await bcrypt.compare(senha, usuario.senha))) {
            return res.status(403).json({ erro: 'Senha incorreta.' });
        }

        await Post.deleteMany({ autor: usuario._id });
        await Usuario.deleteOne({ _id: usuario._id });

        req.session.destroy(() => {
            res.clearCookie('connect.sid');
            res.json({ mensagem: 'Conta excluída.' });
        });

    } catch (erro) {
        console.error('Erro ao excluir conta:', erro);
        res.status(500).json({ erro: 'Erro interno ao excluir a conta.' });
    }
});

// ------------------------------------------
// POSTS
// ------------------------------------------

app.get('/api/meus-posts', verificarApi, async (req, res) => {
    try {
        const posts = await Post.find({ autor: req.session.userId })
            .sort({ criadoEm: -1 })
            .limit(100);

        res.json(posts.map(p => ({ id: p._id, texto: p.texto, criadoEm: p.criadoEm })));

    } catch (erro) {
        console.error('Erro ao listar posts:', erro);
        res.status(500).json({ erro: 'Erro interno ao carregar os posts.' });
    }
});

app.post('/api/posts', verificarApi, async (req, res) => {
    try {
        const texto = String(req.body.texto || '').trim();

        if (!texto || texto.length > 280) {
            return res.status(400).json({ erro: 'O post deve ter de 1 a 280 caracteres.' });
        }

        const post = await Post.create({ autor: req.session.userId, texto });

        res.status(201).json({ id: post._id, texto: post.texto, criadoEm: post.criadoEm });

    } catch (erro) {
        console.error('Erro ao criar post:', erro);
        res.status(500).json({ erro: 'Erro interno ao publicar.' });
    }
});

app.delete('/api/posts/:id', verificarApi, async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ erro: 'Post inválido.' });
        }

        // só apaga se o post for do próprio usuário
        const resultado = await Post.deleteOne({ _id: req.params.id, autor: req.session.userId });

        if (resultado.deletedCount === 0) {
            return res.status(404).json({ erro: 'Post não encontrado.' });
        }

        res.json({ ok: true });

    } catch (erro) {
        console.error('Erro ao excluir post:', erro);
        res.status(500).json({ erro: 'Erro interno ao excluir o post.' });
    }
});

function sair(req, res, resposta) {
    req.session.destroy(() => {
        res.clearCookie('connect.sid');
        resposta();
    });
}

app.get('/logout', (req, res) => {
    sair(req, res, () => res.redirect('/login.html'));
});

app.post('/logout', (req, res) => {
    sair(req, res, () => res.json({ ok: true }));
});

// ==========================================
// 6. INICIAR SERVIDOR (só depois de conectar ao banco)
// ==========================================

const PORT = process.env.PORT || 3000;

mongoose.connect(process.env.MONGODB_URI)
    .then(async () => {
        console.log('MongoDB conectado.');

        // Remove índices que não existem mais no schema (o índice único antigo de "nome")
        try {
            await Usuario.syncIndexes();
        } catch (erro) {
            console.error('Aviso: não foi possível sincronizar os índices:', erro.message);
        }

        app.listen(PORT, () => {
            console.log('=========================================');
            console.log(`TORRE STARK ONLINE NA PORTA ${PORT}`);
            console.log('=========================================');
            console.log(`Cadastro: http://localhost:${PORT}/cadastro.html`);
            console.log(`Chat: http://localhost:${PORT}/chat.html`);
            console.log(`Login: http://localhost:${PORT}/login.html`);
            console.log(`Perfil: http://localhost:${PORT}/perfil.html`);
        });
    })
    .catch((erro) => {
        console.error('Falha ao conectar no MongoDB:', erro.message);
        process.exit(1);
    });