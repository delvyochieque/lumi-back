// Importa as dependências necessárias
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const authMiddleware = require('../middlewares/authMiddleware'); // Adicionado o import do middleware

// Rota de registro
router.post('/register', async (req, res) => {
  try {
    const { nome, sobrenome, email, senha } = req.body;
    
    // Validação dos campos
    if (!nome || !sobrenome || !email || !senha) {
      return res.status(400).json({ 
        message: 'Todos os campos são obrigatórios',
        required_fields: ['nome', 'sobrenome', 'email', 'senha']
      });
    }

    // Verifica a existência do usuário
    const userExists = await pool.query(
      'SELECT * FROM usuarios WHERE email = $1', 
      [email]
    );
    
    if (userExists.rows.length > 0) {
      return res.status(400).json({ message: 'Email já cadastrado' });
    }

    // Criptografa a senha
    const hashedPassword = await bcrypt.hash(senha, 10);
    
    // Insere no banco
    const newUser = await pool.query(
      'INSERT INTO usuarios (nome, sobrenome, email, senha) VALUES ($1, $2, $3, $4) RETURNING *',
      [nome, sobrenome, email, hashedPassword]
    );

    // Retorna sucesso (sem senha)
    const user = newUser.rows[0];
    delete user.senha;
    res.status(201).json(user);

  } catch (error) {
    console.error('Erro no registro:', error);
    res.status(500).json({ 
      message: 'Erro no servidor',
      error: error.message,
      detail: error.detail
    });
  }
});

// Rota de login
router.post('/login', async (req, res) => {
  try {
    const { email, senha } = req.body;
    
    if (!email || !senha) {
      return res.status(400).json({ 
        message: 'Email e senha são obrigatórios' 
      });
    }

    // Busca usuário
    const user = await pool.query(
      'SELECT id, nome, sobrenome, email, senha, is_configured FROM usuarios WHERE email = $1',
      [email]
    );

    if (user.rows.length === 0) {
      return res.status(401).json({ message: 'Credenciais inválidas' });
    }

    // Verifica senha
    const validPassword = await bcrypt.compare(senha, user.rows[0].senha);
    if (!validPassword) {
      return res.status(401).json({ message: 'Credenciais inválidas' });
    }

    // Gera token JWT
    const token = jwt.sign(
      { id: user.rows[0].id },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Retorna token e dados do usuário (sem senha)
    const userData = user.rows[0];
    delete userData.senha;
    res.json({ token, user: userData });

  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ 
      message: 'Erro no servidor',
      error: error.message
    });
  }
});

// Rota para salvar configurações
router.post('/configuracoes', authMiddleware, async (req, res) => {
  try {
    const { genero_ia, idioma } = req.body;
    const usuario_id = req.user.id; // Pega o ID do usuário autenticado pelo token

    // Validação dos campos
    if (!genero_ia || !idioma) {
      return res.status(400).json({ 
        message: 'Gênero da IA e idioma são obrigatórios' 
      });
    }

    // Verifica se já existe uma configuração para o usuário
    const existingConfig = await pool.query(
      'SELECT * FROM configuracoes WHERE usuario_id = $1',
      [usuario_id]
    );

    if (existingConfig.rows.length > 0) {
      // Atualiza a configuração existente
      const updatedConfig = await pool.query(
        'UPDATE configuracoes SET genero_ia = $1, idioma = $2 WHERE usuario_id = $3 RETURNING *',
        [genero_ia, idioma, usuario_id]
      );
      
      // Marca o usuário como configurado
      await pool.query(
        'UPDATE usuarios SET is_configured = TRUE WHERE id = $1',
        [usuario_id]
      );

      return res.json(updatedConfig.rows[0]);
    } else {
      // Insere uma nova configuração
      const newConfig = await pool.query(
        'INSERT INTO configuracoes (usuario_id, genero_ia, idioma) VALUES ($1, $2, $3) RETURNING *',
        [usuario_id, genero_ia, idioma]
      );

      // Marca o usuário como configurado
      await pool.query(
        'UPDATE usuarios SET is_configured = TRUE WHERE id = $1',
        [usuario_id]
      );

      return res.json(newConfig.rows[0]);
    }
  } catch (error) {
    console.error('Erro ao salvar configurações:', error);
    res.status(500).json({ 
      message: 'Erro no servidor',
      error: error.message
    });
  }
});

module.exports = router;