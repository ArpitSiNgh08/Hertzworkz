const express = require('express');
const router = express.Router();
const Group = require('../models/Group');
const Message = require('../models/Message');

// Create a new group
router.post('/create', async (req, res) => {
    try {
        const { name, members, createdBy } = req.body;

        if (!name || !members || !createdBy) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        // Ensure members is an array and includes the creator
        const allMembers = Array.from(new Set([...members, createdBy]));

        const newGroup = new Group({
            name,
            members: allMembers,
            createdBy
        });

        await newGroup.save();
        const populatedGroup = await Group.findById(newGroup._id).populate('members', 'email _id');
        res.status(201).json(populatedGroup);
    } catch (error) {
        console.error('Error creating group:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Get all groups a user belongs to
router.get('/user/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const groups = await Group.find({ members: userId }).populate('members', 'email _id');
        res.json(groups);
    } catch (error) {
        console.error('Error fetching user groups:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Get messages for a group
router.get('/:groupId/messages', async (req, res) => {
    try {
        const { groupId } = req.params;
        const messages = await Message.find({ groupId }).sort({ timestamp: 1 }).populate('sender', 'email _id');
        res.json(messages);
    } catch (error) {
        console.error('Error fetching group messages:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

module.exports = router;
