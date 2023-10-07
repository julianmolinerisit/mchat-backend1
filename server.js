const express = require('express');
const app = express();
const userRoutes = require('./routes/userRoutes');
const User = require('./models/User');
const Message = require('./models/Message');
const rooms = ['general', 'tech', 'finance', 'crypto', 'MonkIA'];
const fetch = require('node-fetch');
const cors = require('cors');
const dotenv = require('dotenv');
dotenv.config();
const twilio = require('twilio');
const chatGptKey = process.env.CHATGPT_KEY;


const { PORT, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_SERVICE_SID } = process.env;

const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cors());

app.use('/users', userRoutes);
require('./connection');

const server = require('https').createServer(app);
const io = require('socket.io')(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.post("/verify/:phoneNumber", async (req, res) => {
  try {
      const { phoneNumber } = req.params;

      // Send verification code via Twilio
      const verification = await twilioClient.verify.services(TWILIO_SERVICE_SID)
          .verifications.create({
              to: phoneNumber,
              channel: "whatsapp"
          });

      res.json(verification); // Return verification status
  } catch (error) {
      console.log(error);
      res.status(500).json({ error: "An error occurred." });
  }
});


app.post('/check/:phoneNumber/:code', async (req, res) => {
  try {
      const { phoneNumber, code } = req.params;
      const { status } = await twilioClient.verify.v2.services(TWILIO_SERVICE_SID).verificationChecks.create({
          to: phoneNumber,
          code
      })
      if (status == "approved") {
          res.json({ status })
      } else {
          res.status(401).json({ status: "Invalid" })
      }
  } catch (error) {
      console.log(error)
  }
});


async function getLastMessagesFromRoom(room){
  let roomMessages = await Message.aggregate([
    {$match: {to: room}},
    {$group: {_id: '$date', messagesByDate: {$push: '$$ROOT'}}}
  ])
  return roomMessages;
}

function sortRoomMessagesByDate(messages){
  return messages.sort(function(a, b){
    let date1 = a._id.split('/');
    let date2 = b._id.split('/');

    date1 = date1[2] + date1[0] + date1[1]
    date2 =  date2[2] + date2[0] + date2[1];

    return date1 < date2 ? -1 : 1
  })
}

// socket connection

io.on('connection', (socket)=> {
  console.log('A user connected');

  socket.on('new-user', async ()=> {
    const members = await User.find();
    io.emit('new-user', members)
  })

  socket.on('join-room', async(newRoom, previousRoom)=> {
    socket.join(newRoom);
    socket.leave(previousRoom);
    let roomMessages = await getLastMessagesFromRoom(newRoom);
    roomMessages = sortRoomMessagesByDate(roomMessages);
    socket.emit('room-messages', roomMessages)
  })

  socket.on('message-room', async(room, content, sender, time, date) => {
    const newMessage = await Message.create({content, from: sender, time, date, to: room});
    let roomMessages = await getLastMessagesFromRoom(room);
    roomMessages = sortRoomMessagesByDate(roomMessages);
    // sending message to room
    io.to(room).emit('room-messages', roomMessages);
    socket.broadcast.emit('notifications', room)
  })
  

  app.delete('/logout', async(req, res)=> {
    try {
      const {_id, newMessages} = req.body;
      const user = await User.findById(_id);
      user.status = "offline";
      user.newMessages = newMessages;
      await user.save();
      const members = await User.find();
      socket.broadcast.emit('new-user', members);
      res.status(200).send();
    } catch (e) {
      console.log(e);
      res.status(400).send()
    }
  })

})


app.get('/rooms', (req, res)=> {
  res.json(rooms)
})


server.listen(PORT, ()=> {
  console.log('listening to port', PORT)
})


const CHATGPT_KEY = chatGptKey;

app.use(express.json());

app.post('/chatgpt', async (req, res) => {
  const userMessage = req.body.message;
  const callGptResponse = await callToChatGpt(userMessage);
  res.json({
    "response": callGptResponse
  });
});


async function callToChatGpt(message) {
  const bodyRequest = {
    model: 'gpt-3.5-turbo',
    max_tokens: 50,
    messages: [
      { role: 'user', content: message }
    ],
  };

  const request = {
    method: 'POST',
    headers: {
      'Content-type': 'application/json',
      Authorization: `Bearer ${CHATGPT_KEY}`,
    },
    body: JSON.stringify(bodyRequest),
  };

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', request);
    const json = await response.json();
    return json.choices[0].message.content;
  } catch (error) {
    console.error('Error al llamar a la API:', error);
    return 'Error en la solicitud a la API.';
  }
}
