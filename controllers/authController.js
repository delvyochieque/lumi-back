const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const userModel = require('../models/userModel');
const validator = require('validator');

// Função para validar dados de entrada
const validateInput = (nome, sobrenome, email, senha, telefone) => {
    const errors = [];

    if (!nome || !sobrenome || !email || !senha) {
        errors.push('Todos os campos são obrigatórios.');
    }

    if (!validator.isEmail(email)) {
        errors.push('Email inválido.');
    }

    if (senha.length < 6) {
        errors.push('A senha deve ter pelo menos 6 caracteres.');
    }

    if (telefone && !validator.isMobilePhone(telefone, 'pt-BR')) {
        errors.push('Número de telefone inválido.');
    }

    return errors;
};

// Cadastro de usuário
const register = async (req, res) => {
    const { nome, sobrenome, email, senha, telefone } = req.body;

    try {
        // Validação dos dados
        const validationErrors = validateInput(nome, sobrenome, email, senha, telefone);
        if (validationErrors.length > 0) {
            return res.status(400).json({ message: validationErrors.join(' ') });
        }

        // Verifica se o usuário já existe
        const existingUser = await userModel.findUserByEmail(email);
        if (existingUser) {
            return res.status(400).json({ message: 'Email já cadastrado.' });
        }

        // Criptografa a senha
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(senha, salt);

        // Cria o usuário
        const newUser = await userModel.createUser({ nome, sobrenome, email, senha: hashedPassword, telefone });
        res.status(201).json({ message: 'Usuário cadastrado com sucesso!', user: newUser });
    } catch (error) {
        console.error('Erro no cadastro:', error);

        // Tratamento de erros específicos do PostgreSQL
        if (error.code === '23505') { // Violação de restrição única
            return res.status(400).json({ message: 'Email já cadastrado.' });
        }

        res.status(500).json({ message: 'Erro ao cadastrar usuário.' });
    }
};

// Login de usuário
const login = async (req, res) => {
    const { email, senha } = req.body;

    try {
        // Validação dos dados
        if (!email || !senha) {
            return res.status(400).json({ message: 'Email e senha são obrigatórios.' });
        }

        if (!validator.isEmail(email)) {
            return res.status(400).json({ message: 'Email inválido.' });
        }

        // Buscando o usuário pelo email
        const user = await userModel.findUserByEmail(email);
        if (!user) {
            return res.status(400).json({ message: 'Email ou senha incorretos.' });
        }

        // Verifica a senha
        const isPasswordValid = await bcrypt.compare(senha, user.senha);
        if (!isPasswordValid) {
            return res.status(400).json({ message: 'Email ou senha incorretos.' });
        }

       // Gera o token JWT
       const token = jwt.sign(
        { id: user.id }, // Payload
        process.env.JWT_SECRET, // Chave secreta
        { expiresIn: '1h' } // Tempo de expiração
    );

        res.status(200).json({ message: 'Login realizado com sucesso!', token });
    } catch (error) {
        console.error('Erro no login:', error);

        // Tratamento de erros específicos
        if (error.code === '23505') { // Violação de restrição única
            return res.status(400).json({ message: 'Email já cadastrado.' });
        }

        res.status(500).json({ message: 'Erro ao realizar login.' });
    }
};

module.exports = {
    register,
    login,
};