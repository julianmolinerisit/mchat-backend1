const router = require('express').Router();
const User = require('../models/User');

// creating user
router.post('/', async (req, res) => {
    try {
        const { name, email, password, picture, phoneNumber } = req.body; // Agrega phoneNumber al destructuring
        console.log(req.body);
        const user = await User.create({ name, email, password, picture, phoneNumber }); // Agrega phoneNumber al crear el usuario
        res.status(201).json(user);
    } catch (e) {
        let msg;
        if (e.code === 11000) {
            msg = "User already exists";
        } else {
            msg = e.message;
        }
        console.log(e);
        res.status(400).json({ error: msg }); // Cambia el formato de respuesta para ser coherente
    }
});

// login user

router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findByCredentials(email, password);
        user.status = 'online';
        await user.save();
        res.status(200).json(user);
    } catch (e) {
        res.status(400).json({ error: e.message }); // Cambia el formato de respuesta para ser coherente
    }
});

module.exports = router;
