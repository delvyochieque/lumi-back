const pool = require('../config/db');
const bcrypt = require('bcrypt');

// Função para criar um usuário
const createUser = async (userData) => {
    const { nome, sobrenome, email, senha, telefone } = userData;

    // Criptografa a senha
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(senha, salt);

    // Insere o usuário no banco de dados
    const query = `
        INSERT INTO usuarios (nome, sobrenome, email, senha, telefone)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, nome, email, telefone;
    `;
    const values = [nome, sobrenome, email, hashedPassword, telefone];

    const result = await pool.query(query, values);
    return result.rows[0];
};

// Função para buscar um usuário por email
const findUserByEmail = async (email) => {
    const query = 'SELECT * FROM usuarios WHERE email = $1';
    const result = await pool.query(query, [email]);
    return result.rows[0];
};

module.exports = {
    createUser,
    findUserByEmail,
};