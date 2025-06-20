require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false, // Necessário para Render
    },
});

pool.on('error', (err) => {
    console.error('Erro inesperado no pool do PostgreSQL:', err);
    // Reconecta após 5 segundos
    setTimeout(() => pool.connect(), 5000);
});

pool.connect()
    .then(() => {
        console.log('✅ Banco de dados conectado com sucesso!');
    })
    .catch((err) => {
        console.error('❌ Erro ao conectar ao banco:', err);
        process.exit(1);
    });

module.exports = pool;