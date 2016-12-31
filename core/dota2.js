'use strict';

let logger = require('./logger.js');
let Dota2 = require('dota2');
let dota2;
let inGame = false;
let util = require('util');
let fs = require('fs');
let path = require('path');
let minimap = require('minimap');
let _ = require('underscore');
let botFriends = require('./friends.js');
let discord = require('jankbot-discord');


let gameState = -1;
let gameStartTime;

let votes = {
  2 : 0,
  16 : 0,
  1 : 0,
  20 : 0
};
let voterPreferences = {};
let password;
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
  fill_with_bots: false,
  allow_spectating: true,
  pass_key: password,
  cm_pick: 0,
  radiant_series_wins: 0,
  dire_series_wins: 0,
  allchat: false };


let CONFIG;
let DICT;

exports.init = function(bot, botCONFIG, botDICT) {
  dota2 = new Dota2.Dota2Client(bot, true);
  CONFIG = botCONFIG;
  DICT = botDICT;
};

password = CONFIG.dota2_lobby_pw;

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


      let members = [];
      let chatChannel = "bottom";


      dota2.joinChat(chatChannel);

      dota2.createPracticeLobby(password,
        dota2LobbyOptions,
        function(err, response) {
        logger.log("createPracticeLobby" + util.inspect(response));
        dota2.joinPracticeLobbyTeam(1, 4);
      });

      dota2.on("practiceLobbyUpdate",
        // TODO: remove player vote for preference when they leave
        function(lobby) {
          logger.log("practiceLobbyUpdate");
          let lobbyId = lobby.lobby_id;
          logger.log("lobbyId :" + lobbyId);
  
          members = lobby.members;
          gameStartTime = lobby.game_start_time;
          gameState = lobby.game_state;
  
          // join the lobby chat if not in it
          if (IN_CHAT === false) {
            logger.log("Joining lobby chat.");
            // DOTAChannelType_Lobby = 3;
            dota2.joinChat(LOBBY_CHAT_PREFIX + lobbyId, 3);
            IN_CHAT = true;
          }
  
          if (members.length == 1 && members[0].team === 0 || members[0].team == 1) {
            logger.log("ALERT!  Bot is in a player slot... Attempting to fix");
            dota2.joinPracticeLobbyTeam(1, 4);
          }

          // if (members.length - 1 > 8) {
          //   discord.post(`I have ${members.length -1} players in my lobby.`);
          // }
  
          // start game when 10 players are in slots
          logger.log(`There are ${members.length - 1} players in the lobby`);
          if (numberOfPlayersInLobby(members) === 10 && gameState === 0) {
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
       logger.log(`${senderName} said ${message} on ${channel}`);

       let source = dota2.ToSteamID(chatObject.account_id);
       let preference;

       if (channel.indexOf(LOBBY_CHAT_PREFIX) >= 0) {
        switch (message) {
          case '!start':
            dota2.launchPracticeLobby();
            break;
          case '-ap':
            preference = Dota2.schema.DOTA_GameMode.DOTA_GAMEMODE_AP;
            updateVotePreferences(source, preference);
            break;
          case '-cm':
            preference = Dota2.schema.DOTA_GameMode.DOTA_GAMEMODE_CM;
            updateVotePreferences(source, preference);
            break;
          case '-cd':
            preference = Dota2.schema.DOTA_GameMode.DOTA_GAMEMODE_CD;
            updateVotePreferences(source, preference);
            break;
          case '-ardm':
            preference = Dota2.schema.DOTA_GameMode.DOTA_GAMEMODE_ARDM;
            updateVotePreferences(source, preference);
            break;
        }
        logger.log(util.inspect(votes));
        // update gameMode
        let gameMode = getMax(votes); // TODO: sets an undefined if something else is said...
        logger.log("chatMessage.gameMode after transform is: " + gameMode);
          switch (gameMode) {
            case '1':
              gameMode = Dota2.schema.DOTA_GameMode.DOTA_GAMEMODE_AP;
              break;
            case '2':
              gameMode = Dota2.schema.DOTA_GameMode.DOTA_GAMEMODE_CM;
              break;
            case '16':
              gameMode = Dota2.schema.DOTA_GameMode.DOTA_GAMEMODE_CD;
              break;
            case '20':
              gameMode = Dota2.schema.DOTA_GameMode.DOTA_GAMEMODE_ARDM;
              break;
          }
          dota2LobbyOptions.game_mode = gameMode;
          logger.log("chatMessage.gameMode = " + gameMode);
          logger.log("Mode with highest votes: " + gameMode);
          if (dota2.Lobby.Lobby_id !== null && dota2.Lobby.lobby_id !== undefined) {
            dota2.configPracticeLobby(dota2.Lobby.lobby_id, dota2LobbyOptions);
        }
       } else {
          switch (message) {
            case '!invite':
              logger.log('Creating lobby invite for ' + senderName);
              dota2.inviteToLobby(source);
              break;
          }
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

exports.command = function(source, input, original) {

  let command = input[0];
  console.log("dota2 command: " + command);
  switch(command) {
    case DICT.DOTA2_CMDS.lobby:
      actions.lobby(source);
      return true;
    default:
      return false;
  }

};
let actions = {

  lobby: function(source) {
      if (dota2.Lobby !== null && dota2.Lobby !== undefined) {
        botFriends.messageUser(source, "Lobby currently has " + numberOfPlayersInLobby(dota2.Lobby.members) + " player(s).");
        dota2.inviteToLobby(source);
      }
  }
};
function numberOfPlayersInLobby (members) {
  let numberOfPlayers = 0;
  for (let member in members) {
    if (members[member].team === 0 || members[member].team === 1) {
      numberOfPlayers++;
    }
 }
 return numberOfPlayers;
}

function getMax(arr) {
  var inverted = _.invert(arr); // {21:'one', 35:'two', 24:'three', 2:'four', 18:'five'};
  var max = _.max(arr); // 35
  var max_key = inverted[max]; // {21:'one', 35:'two', 24:'three', 2:'four', 18:'five'}[35] => 'two'
  return max_key;
}

function updateVotePreferences(source, preference) {
  if (voterPreferences.hasOwnProperty(source)) {
    votes[voterPreferences[source]]--;
    votes[preference]++;
  } else {
    votes[preference]++;
  }
  voterPreferences[source] = preference;
  logger.log("voterPreferences: " + util.inspect(voterPreferences));
  logger.log("votes: " + util.inspect(votes));
}