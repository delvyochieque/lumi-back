// Importa as dependências necessárias
const path = require('path');
const express = require('express');
const pool = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const chatRoutes = require('./routes/chatRoutes'); // Importa as rotas de chat
const authMiddleware = require('./middlewares/authMiddleware');
const cors = require('cors');
require('dotenv').config({
  path: path.resolve(__dirname, `.env.${process.env.NODE_ENV || 'development'}`)
});

// Inicializa o app Express
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware para parsear JSON (apenas uma vez)
app.use(express.json());

// Habilita CORS
app.use(cors({
  origin: 'http://localhost:8080', // URL do frontend Vue
  credentials: true
}));

// Rotas
app.use('/auth', authRoutes); // Rotas de autenticação
app.use('/chat', chatRoutes); // Rotas de chat

// Rota de teste de conexão com o banco de dados
app.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.send(`Servidor rodando! Hora atual no BD: ${result.rows[0].now}`);
  } catch (error) {
    console.error(error);
    res.status(500).send('Erro ao conectar ao banco.');
  }
});

// Rota protegida
app.get('/protected', authMiddleware, (req, res) => {
  res.json({ message: 'Rota protegida acessada com sucesso!', user: req.user });
});

// Testa a conexão com o banco ao iniciar
pool.connect((err) => {
  if (err) {
    console.error('Erro ao conectar ao banco:', err);
  } else {
    console.log('✅ Banco de dados conectado com sucesso!');
  }
});

// Inicia o servidor
app.listen(PORT, () => {
  console.log(`✅ Servidor rodando na porta ${PORT}`);
  console.log('NODE_ENV:', process.env.NODE_ENV);
  console.log('JWT_SECRET:', process.env.JWT_SECRET);
});