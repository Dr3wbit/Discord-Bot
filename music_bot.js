const { Client, Util} = require('discord.js');
const { TOKEN, PREFIX, YOUTUBE_API_KEY } = require('./config');
const ytdl = require('ytdl-core');
const YouTube = require('simple-youtube-api')

const client = new Client ({ 
    disableEveryone: true 
});

const youtube = new YouTube(YOUTUBE_API_KEY);

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
    const searchString = args.slice(1).join(' ');
    const url = args[1] ? args[1].replace(/<(.+)>/g, '$1') : '';
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

        if (url.match(/^https?:\/\/(www.youtube.com|youtube.com)\/playlist(.*)$/)) {
            const playlist = await youtube.getPlaylist(url);
            const videos = await playlist.getVideos();
            for (const video of Object.values(videos)) {
                const video2 = await youtube.getVideoByID(video.id);
                await handleVideo(video2, msg, voiceChannel, true);
            }
            return msg.channel.send(`Playlist : **${playlist.title}** has been added to queue!`);

        } else {
            try {
                var video = await youtube.getVideo(url);
            } catch (error) {
                try {
                    var videos = await youtube.searchVideos(searchString, 1);
                    var video = await youtube.getVideoByID(videos[0].id);
                } catch (err){
                    console.error(err);
                    return msg.channel.send('Could not find anything..')
                }
            }
            return handleVideo(video, msg, voiceChannel);
        }


    } else if (msg.content.startsWith(`${PREFIX}skip`)) {
        if (!msg.member.voiceChannel) return msg.channel.send('you are not in a voice channel!')
        if (!serverQueue) return msg.channel.send('Nothing to skip!')
        serverQueue.connection.dispatcher.end('Skip Command has been used');
        return
    } else if (msg.content.startsWith(`${PREFIX}stop`)) {
        if (!msg.member.voiceChannel) return msg.channel.send('you are not in a voice channel!')
        if (!serverQueue) return msg.channel.send('Nothing to stop!')
        serverQueue.songs = [];
        serverQueue.connection.dispatcher.end('Stop Command has been used');
        return;
    } else if(msg.content.startsWith(`${PREFIX}volume` || `${PREFIX}vol`)) {
        if (!serverQueue) return msg.channel.send('Nothing Playing!');
        if (!args[1]) return msg.channel.send(`The current volume is: ${serverQueue.volume}`);
        if (args[1] > 2) return msg.channel.send('the volume cannot be greater than 2 ;) Avery!');
        serverQueue.volume = args[1];
        serverQueue.connection.dispatcher.setVolumeLogarithmic(args[1] / 5);
        return msg.channel.send(`volume is now set to **${args[1]}**`)
    } else if (msg.content.startsWith(`${PREFIX}np`)){
        if (!serverQueue) return msg.channel.send('Nothing Playing!');
        return msg.channel.send(`Now Playing **${serverQueue.songs[0].title}**`);
    } else if (msg.content.startsWith(`${PREFIX}queue`)) {
        if (!serverQueue) return msg.channel.send('Nothing Playing!');
        return msg.channel.send(`
**Song Queue:**
${serverQueue.songs.map(song => `**-**${song.title}`).join('\n')}

**Now Playing:** ${serverQueue.songs[0].title}
        `);
    } else if (msg.content.startsWith(`${PREFIX}pause`)) {
        if (serverQueue && serverQueue.playing) {
            serverQueue.connection.dispatcher.pause();
            serverQueue.playing = false;
            return msg.channel.send('Music Paused..')
        }
        return msg.channel.send('there is nothing playing!');
       
    } else if (msg.content.startsWith(`${PREFIX}resume`)) {
        if (serverQueue && !serverQueue.playing) {
            serverQueue.playing = true;
            serverQueue.connection.dispatcher.resume();
            return msg.channel.send('Music resumed..');
        }
        return msg.channel.send('Nothing is playing..');
    }
    return;
});

async function handleVideo(video, msg, voiceChannel, playlist = false){
    const serverQueue = queue.get(msg.guild.id);

    const song = {
        id: video.id,
        title: Util.escapeMarkdown(video.title),
        url: `https://www.youtube.com/watch?v=${video.id}`
    };

    if (!serverQueue){
        const queueConstruct = {
            textChannel: msg.channel,
            voiceChannel: voiceChannel,
            connection: null,
            songs: [],
            volume: 0.5,
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
        if (playlist) return;
        else msg.channel.send(`**${song.title}** has been added to the queue!`);
    }
    return;
}

function play(guild, song) {
    const serverQueue = queue.get(guild.id);

    if(!song) {
        serverQueue.voiceChannel.leave();
        queue.delete(guild.id);
        return;
    }
    console.log('server queue:', serverQueue.songs);

    const dispatcher = serverQueue.connection.playStream(ytdl(song.url))
            .on('end', reason => {
                if (reason === 'Stream is not generating quickly enough.') console.log('Song ended.');
                console.log(reason);
                serverQueue.songs.shift();
                play(guild, serverQueue.songs[0]);
            })
            .on('error', error => console.error(error));
        dispatcher.setVolumeLogarithmic(serverQueue.volume / 5);

        serverQueue.textChannel.send(`Start Playing: **${song.title}**`);
}

client.login(TOKEN);