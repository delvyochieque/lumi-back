const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
    // Extrai o token do header Authorization
    const token = req.header('Authorization')?.replace('Bearer ', '');

    // Verifica seo token foi fornecido
    if (!token) {
        return res.status(401).json({ message: 'Acesso negado. Token não fornecido.' });
    }

    try {
        // Verifica e decodifica o token usando o JWT_SECRET
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // Adiciona o payload decodificado (inclui o id) ao req
        next(); // Prossegue para a próxima função
    } catch (error) {
        // Status 401 para token inválido ou expirado, mais semanticamente correto que 400
        return res.status(401).json({ 
            message: 'Token inválido ou expirado.',
            error: error.message // Inclui detalhes do erro para debug
        });
    }
};

module.exports = authMiddleware;