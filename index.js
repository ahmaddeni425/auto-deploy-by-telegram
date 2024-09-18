import fetch from 'node-fetch';
import dotenv from 'dotenv';
import TelegramBot from 'node-telegram-bot-api';
import fs from 'fs';
import { exec } from 'child_process';

// Load environment variables
dotenv.config();

// Initialize Telegram Bot
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// Load projects from project.json
const projects = JSON.parse(fs.readFileSync('project.json'));

// Command: /list_project
bot.onText(/\/list_project/, (msg) => {
    if (msg.chat.id.toString() !== process.env.MASTER_CHAT_ID) {
        bot.sendMessage(msg.chat.id, "Sorry, you are not authorized");
        return;
    }

    let response = "List Project\n";
    projects.forEach((project, index) => {
        response += `${index + 1}. ${project.name} => /deploy ${project.command}\n`;
    });
    bot.sendMessage(msg.chat.id, response);
});

// Command: /deploy <nama project>
bot.onText(/\/deploy (.+)/, async (msg, match) => {
    if (msg.chat.id.toString() !== process.env.MASTER_CHAT_ID) {
        bot.sendMessage(msg.chat.id, "Sorry, you are not authorized");
        return;
    }

    const projectName = match[1];
    const project = projects.find(proj => proj.command === projectName);

    if (!project) {
        bot.sendMessage(msg.chat.id, `Sorry, project ${projectName} doesn't setup yet`);
        return;
    }

    // Execute sudo command
    const command = `sudo ${project.command}`;
    try {
        const response = await executeSudoCommand(command, msg.chat.id);
        bot.sendMessage(msg.chat.id, `Project ${project.name} has been deployed`);
        // Send each line of response to Telegram
        response.split('\n').forEach(line => {
            bot.sendMessage(msg.chat.id, line.trim());
        });
    } catch (error) {
        bot.sendMessage(msg.chat.id, `Error deploying ${project.name}: ${error}`);
    }
});

// Function to execute sudo command and return output
async function executeSudoCommand(command, chatId) {
    const promptForInput = (message) => {
        return new Promise((resolve) => {
            bot.sendMessage(chatId, message).then(() => {
                bot.once('message', (msg) => {
                    resolve(msg.text);
                });
            });
        });
    };

    return new Promise((resolve, reject) => {
        const process = exec(command, { maxBuffer: 1024 * 500 }); // Increase buffer size for larger output

        let output = '';

        process.stdout.on('data', async (data) => {
            output += data;
            const passwordPromptIndex = output.indexOf('Password:');

            if (passwordPromptIndex !== -1) {
                const password = await promptForInput('Please enter your sudo password:');
                process.stdin.write(password + '\n'); // Send password to stdin
            }
        });

        process.stderr.on('data', (data) => {
            output += data;
        });

        process.on('close', (code) => {
            if (code !== 0) {
                reject(`Error: ${output || 'Process exited with code ' + code}`);
                return;
            }
            resolve(output);
        });
    });
}
