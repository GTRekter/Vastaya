import React from 'react';
import Chat from '../components/Chat';

const ChatPage = () => {
    return (
        <div className="container full-height-container">
            <div className="text-white text-center py-5">
                <p className="eyebrow">Signal & Comms</p>
                <h1>Galactic Comms Relay</h1>
                <p>Chat with Linky to synthesize missions, gather intel, and polish customer-ready stories. Use this console to iterate on prompts, unlock copy, and keep every transmission aligned with your campaign goals.</p>
            </div>
            <Chat />
        </div>
    );
};

export default ChatPage;
