const { Client } = require('discord.js');
const { TOKEN, PREFIX } = require('./config');
const ytdl = require('ytdl-core')

const client = new Client ({ 
    disableEveryone: true 
});

const queue = new Map();

client.on('warn', console.warn);

client.on('error', console.error);

client.on('ready', () => console.log('bot is ready!'));

client.on('disconnect', () => console.log('bot is disconnecting!'));

client.on('reconnecting', () => console.log('bot is reconnecting now!'));

client.on('message', async msg => {
    if (msg.author.bot) return;
    if (!msg.content.startsWith(PREFIX)) return;
    const args = msg.content.split(' ');
    const serverQueue = queue.get(msg.guild.id);

    if (msg.content.startsWith(`${PREFIX}play`)){
        const voiceChannel = msg.member.voiceChannel;
        if (!voiceChannel) return msg.channel.send('You need to be in a voice channel to play music!')
        const permissions = voiceChannel.permissionsFor(msg.client.user);
        if (!permissions.has('CONNECT')){
            return msg.channel.send('you do not have permissions for this!');
        }
        if (!permissions.has('SPEAK')){
            return msg.channel.send('I cannot speak in this channel!');
        }

        const songInfo = await ytdl.getInfo(args[1]);
        const song = {
            title: songInfo.title,
            url: songInfo.video_url
        };

        if (!serverQueue){
            const queueConstruct = {
                textChannel: msg.channel,
                voiceChannel: voiceChannel,
                connection: null,
                songs: [],
                volume: 1,
                playing: true,
            };
            queue.set(msg.guild.id, queueConstruct);

            queueConstruct.songs.push(song);

            try {
                var connection = await voiceChannel.join();
                queueConstruct.connection = connection;
                play(msg.guild, queueConstruct.songs[0]);
            } catch(error) {
                console.error(`I could not join the voice channel: ${error}`);
                queue.delete(msg.guild.id);
                return msg.channel.send(`I could not join the voice channel: ${error}`);
            }

        } else {
            serverQueue.songs.push(song);
            console.log('server queue:', serverQueue.songs);
            return msg.channel.send(`**${song.title}** has beend added to the queue!`);
        }

        return;

    } else if (msg.content.startsWith(`${PREFIX}skip`)) {
        if (!msg.member.voiceChannel) return msg.channel.send('you are not in a voice channel!')
        if (!serverQueue) return msg.channel.send('Nothing to skip!')
        serverQueue.connection.dispatcher.end();
        return
    } else if (msg.content.startsWith(`${PREFIX}stop`)) {
        if (!msg.member.voiceChannel) return msg.channel.send('you are not in a voice channel!')
        if (!serverQueue) return msg.channel.send('Nothing to stop!')
        serverQueue.songs = [];
        serverQueue.connection.dispatcher.end();
        return;
    }
    return;
});

function play(guild, song) {
    const serverQueue = queue.get(guild.id);

    if(!song) {
        serverQueue.voiceChannel.leave();
        queue.delete(guild.id);
        return;
    }
    console.log('server queue:', serverQueue.songs);

    const dispatcher = serverQueue.connection.playStream(ytdl(song.url))
            .on('end', () => {
                console.log('song ended!');
                serverQueue.songs.shift();
                play(guild, serverQueue.songs[0]);
            })
            .on('error', error => console.error(error));
        dispatcher.setVolumeLogarithmic(serverQueue.volume / 5);

        serverQueue.textChannel.send(`Start Playing: **${song.title}**`);
}

client.login(TOKEN);