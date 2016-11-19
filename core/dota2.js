'use strict';

let logger = require('./logger.js');
let Dota2 = require('dota2');
let dota2;
let inGame = false;
let util = require('util');
let fs = require('fs');
let path = require('path');

let CONFIG = JSON.parse(fs.readFileSync(path.join('data', 'config.json')));
let accountName = CONFIG.username;

exports.init = function(bot) {
  dota2 = new Dota2.Dota2Client(bot, true);
};

// TODO: use inviteToLobby(steam_id)
// TODO: kick blacklisted users
// TODO: Let the players vote on gamemode

exports.launch = function() {
  if (!inGame) {
    dota2.launch();
    inGame = true;

    dota2.on('ready', function() {
      logger.log('Dota2 is ready to do things.');
      const LOBBY_CHAT_PREFIX = "Lobby_";

      let IN_CHAT = false;

      let gameState = -1;

      let lobbyId = "";
      let members = [];
      let chatChannel = "bottom";
      let password = "123";
      let dota2LobbyOptions = 
      { game_name: 'BotTom IH',
        server_region: Dota2.ServerRegion.USEAST,
        // DOTA_GAMEMODE_CD = 16;
        // DOTA_GAMEMODE_CM = 2;
        // DOTA_GAMEMODE_AP = 1;
        // DOTA_GAMEMODE_ARDM = 20;
        // 
        game_mode: Dota2.schema.DOTA_GameMode.DOTA_GAMEMODE_CD, 
        series_type: 1,
        allow_cheats: false,
        fill_with_bots: true,
        allow_spectating: true,
        cm_pick: 0,
        radiant_series_wins: 0,
        dire_series_wins: 0,
        allchat: false };

      dota2.joinChat(chatChannel);

      dota2.createPracticeLobby(password,
        dota2LobbyOptions,
        function(err, response) {
        logger.log("createPracticeLobby" + util.inspect(response));
        dota2.joinPracticeLobbyTeam(1, 4);
      });

      dota2.on("practiceLobbyUpdate",
        function(lobby) {
        logger.log("practiceLobbyUpdate\n" + util.inspect(lobby));

        lobbyId = lobby.lobby_id;
        logger.log("lobbyId :" + lobbyId);

        members = lobby.members;

        gameState = lobby.game_state;

        // join the lobby chat if not in it
        if (IN_CHAT == false) {
          logger.log("Joining lobby chat.");
          // DOTAChannelType_Lobby = 3;
          dota2.joinChat(LOBBY_CHAT_PREFIX + lobbyId, 3);
          IN_CHAT = true;
        }

        // start game when 10 players are in slots
        logger.log(`There are ${members.length - 1} players in the lobby`);
        if (areTenPlayersInLobby(members)) {
          logger.log(`The lobby is launching.`);
          dota2.balancedShuffleLobby();
          dota2.launchPracticeLobby();
        }

        // cleanup
        if (gameState == 6) {
          logger.log('Game is over. Remaking!');
          dota2.leavePracticeLobby();
          IN_CHAT = false;
          dota2.createPracticeLobby(password,
            dota2LobbyOptions,
            function(err, response) {
            logger.log("createPracticeLobby" + util.inspect(response));
          });
        }
      });

      // Chat messages
     dota2.on('chatMessage', function(channel, senderName, message, chatObject) {
       logger.log(`${senderName} said ${message}`);
       if (message === '!start') {
         dota2.launchPracticeLobby();
       }
     });

    });

    dota2.on('unready', function() {
      logger.log('Connection to GameCoordinator lost.');
    });
  }
};

exports.gg = function() {
  if (inGame) {
    dota2.exit();
    inGame = false;
  }
};

// DEPRECATED - This was broken, but kept for 3.*.* to keep from breaking further
exports.client = dota2;

exports.getClient = function() {
  return dota2;
};

exports.getLobbyStatus = function() {
  return gameState;
}

exports.invitePlayerToLobby = function() {
  dota2.invitePlayerToLobby();
}
function areTenPlayersInLobby (members) {
  let numberOfPlayers = 0;
  for (let member in members) {
    if (members[member].team === 0 || members[member].team === 1) {
      numberOfPlayers++;
    }
 }
 return numberOfPlayers == 10;
}