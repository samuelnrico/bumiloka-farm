
function wajibLogin(req, res, next) {
    if (!req.session || !req.session.pemilikId) {
        return res.status(401).json({
            status: 'gagal',
            pesan: 'Silakan login terlebih dahulu.',
        });
    }

    next();
}

module.exports = { wajibLogin };
