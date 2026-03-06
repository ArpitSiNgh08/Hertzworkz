const express = require('express');
const router = express.Router();
const Message = require('../models/Message');

// Send a message
router.post('/send', async (req, res) => {
    try {
        const { sender, receiver, groupId, text } = req.body;

        if (!sender || (!receiver && !groupId) || !text) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        const newMessage = new Message({
            sender,
            receiver,
            groupId,
            text
        });

        await newMessage.save();

        // If it's a group message, populate the sender for the UI
        if (groupId) {
            await newMessage.populate('sender', 'email _id');
        }

        res.status(201).json(newMessage);
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Get messages between two users
router.get('/messages/:userId1/:userId2', async (req, res) => {
    try {
        const { userId1, userId2 } = req.params;

        const messages = await Message.find({
            $or: [
                { sender: userId1, receiver: userId2 },
                { sender: userId2, receiver: userId1 }
            ]
        }).sort({ timestamp: 1 });

        res.json(messages);
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

module.exports = router;
