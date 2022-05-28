const express = require('express')
const mysql = require('mysql')
const bcrypt = require('bcrypt')
const http = require('http');
const session = require('express-session')
const fitnessCalculatorFunctions = require('fitness-calculator')
const socketio = require('socket.io');
const formatMessage = require('./utils/messages');
const {
    userJoin,
    getCurrentUser,
    userLeave,
    getRoomUsers
  } = require('./utils/users');

const app = express()

const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'fit',
    timezone:'local'
})

app.use(session({
    secret:'elect',
    resave:false,
    saveUninitialized:false
}))



app.use((req,res,next)=>{

    if(req.session.userId===undefined){
        res.locals.isloggedIn = false;
            
       
    }else{
        res.locals.isloggedIn = true;
        res.locals.userId = req.session.userId
        res.locals.username = req.session.username;
       
    }

    next();
})

const server = http.createServer(app);
const io = socketio(server);

const botName = 'Fitness-Kenya';
// Run when client connects

io.on('connection', socket => {
    socket.on('joinRoom', ({ username, room }) => {
      const user = userJoin(socket.id, username, room);
  
      socket.join(user.room);
  
      // Welcome current user
      socket.emit('message', formatMessage(botName, 'Welcome, talk fitness!'));
  
      // Broadcast when a user connects
      socket.broadcast
        .to(user.room)
        .emit(
          'message',
          formatMessage(user.username, `has joined the chat`)
        );
  
      // Send users and room info
      io.to(user.room).emit('roomUsers', {
        room: user.room,
        users: getRoomUsers(user.room)
      });
    });
  
    // Listen for chatMessage
    socket.on('chatMessage', msg => {
      const user = getCurrentUser(socket.id);
  
      io.to(user.room).emit('message', formatMessage(user.username, msg));
    });
  
    // Runs when client disconnects
    socket.on('disconnect', () => {
      const user = userLeave(socket.id);
  
      if (user) {
        io.to(user.room).emit(
          'message',
          formatMessage(botName, `${user.username} has left the chat`)
        );
  
        // Send users and room info
        io.to(user.room).emit('roomUsers', {
          room: user.room,
          users: getRoomUsers(user.room)
        });
      }
    });
  });
app.set('view engine', 'ejs')
app.use(express.static('public'))
app.use(express.urlencoded({extended: false}))

    app.get('/', (req, res) => {
        res.render('home.ejs')
    })
app.get('/chat', (req, res) => {
    if(res.locals.isloggedIn){
    res.render('chat.ejs')
    }else{
        res.redirect('/login')
    }
})
app.get('/videos', (req, res) => {
    if(res.locals.isloggedIn){
    res.render('videos')
    } else{
        res.redirect('/login')
    }
})
app.get('/message', (req, res) => {
    res.render('message.ejs')
})
app.get('/shop', (req, res) => {
    res.render('shop.ejs')
})
app.get('/add-meal',(req, res) => {
    res.render('add-meal');
});
app.get('/edit/:mealId',(req, res) => {
    const mealId = req.params.mealId;
    let sql = `Select * from meal where id = ${mealId}`;
    connection.query(sql,(err, result) => {
        if(err) throw err;
        res.render('edit-meal', {
          
            meal : result[0]
        });
    });
}); 
app.post('/update',(req, res) => {
    const mealId = req.body.id;
    let sql = "update meal SET carbohydrate='"+req.body.carbs+"',  protein='"+req.body.protein+"',  fat='"+req.body.fat+"',   sugar='"+req.body.sugar+"' where id ="+mealId;
     connection.query(sql,(err, results) => {
      if(err) throw err;
      res.redirect('/meal');
    });
});
app.get('/delete/:mealId',(req, res) => {
    const mealId = req.params.mealId;
    let sql = `DELETE from meal where id = ${mealId}`;
    connection.query(sql,(err, result) => {
        if(err) throw err;
        res.redirect('/meal');
    });
});

app.post('/save',(req, res) => { 
    let data = {carbohydrate: req.body.carbs, protein: req.body.protein, fat: req.body.fat, sugar:req.body.sugar};
    let sql = "INSERT INTO meal SET ?";
     connection.query(sql, data,(err, results) => {
      if(err) throw err;
      res.redirect('/meal');
    });
});
 
app.get('/meal', (req, res) => {
    if(res.locals.isloggedIn){
    connection.query(
        'SELECT * FROM macros WHERE userId = ?',[ req.session.userId], (error, results)=>{
            console.log(results)
            const userMacros = fitnessCalculatorFunctions.macros(results[0].gender,results[0].age,results[0].height,results[0].weight,results[0].activity,results[0].goal)
            console.log(userMacros)
            connection.query('SELECT * FROM meal', (err, row) => {
                if(err) throw err;
                res.render('meal', {
                     meal : row,
                     userMacros: userMacros
                });
            });
            
        }
        
        
    )}else{
        res.redirect('/login')
    }
    
})


app.get('/bio', (req, res) => {
    res.render('bio-data')
})
app.post('/bio', (req, res) => {
    let bio = {
        gender: req.body.gender,
        age: req.body.age,
        height: req.body.height,
        weight: req.body.weight,
        activity:req.body.activity,
        goal:req.body.goal
    }
    connection.query(
        'INSERT INTO macros (gender, age, height, weight, activity,goal,userId) VALUES (?,?,?,?,?,?,?)',
        [bio.gender, bio.age,bio.height,bio.weight,bio.activity,bio.goal, res.locals.userId],
        (error, results) => {
            res.redirect('/meal')
        }
    )
    })


app.get('/login', (req, res) => {
    let user = {
        email: '',
        password: ''
    }
    res.render('login.ejs', {error: false, user: user})
})

app.post('/login', (req, res) => {
    let user = {
        email: req.body.email,
        password: req.body.password
    }

    connection.query(
        'SELECT * FROM user WHERE email = ?', [user.email],
        (error, results) => {
            if (results.length > 0) {
                bcrypt.compare(user.password, results[0].password, (error, isEqual) => {
                    if(isEqual) {
                        req.session.userId = results[0].id
                        req.session.username = results[0].fullname.split(' ')[0].toLowerCase()
                        connection.query(
                            'SELECT * FROM macros WHERE userId = ?',[req.session.userId],
                            (error,results)=>{
                                if(results.length>0){
                                    res.redirect('/')
                                }
                                else{
                                    res.redirect('/bio')
                                }
                            }
                        )
                       
                    } else {
                        let message = 'Email/Password mistmatch.'
                        res.render('login.ejs', {error: true, message: message, user: user})
                    }
                })

            } else {
                let message = 'Account does not exist. Please create one'
                res.render('login.ejs', {error: true, message: message, user: user})
            }
        }
    )    
   


})
app.get('/logout',(req,res)=>{
    req.session.destroy((error)=>{
        res.redirect('/')
    })
})

app.get('/signup', (req, res) => {
    let user = {
        email: '',
        fullname: '',
        password: '',
        confirmPassword: ''
    }
    res.render('signup.ejs', {error:false, user: user})
})
app.post('/signup', (req, res) => {
    let user = {
        email: req.body.email,
        fullname: req.body.fullname,
        password: req.body.password,
        confirmPassword: req.body.confirmPassword
    }
   

    if(user.password === user.confirmPassword) {
        connection.query(
            'SELECT email FROM user WHERE email = ?', [user.email],
            (error, results) => {
                if(results.length === 0) {
                    bcrypt.hash(user.password, 10, (error, hash) => {
                        connection.query(
                            'INSERT INTO user (email, fullname, password) VALUES (?,?,?)',
                            [user.email, user.fullname, hash],
                            (error, results) => {
                                res.redirect('/login')
                            }
                        )
                    
                    })
                } else {
                    let message = 'Email already exists.'
                    res.render('signup.ejs', {error: true, message: message, user: user})
                }
            }
        )
    } else {
        let message = 'Password & Confirm Password do not match.'
        console.log(user)
        res.render('signup.ejs', {error: true, message: message, user: user})
    }

})
app.get('*', (req, res) => {
    res.render('404.ejs')
})

const PORT = process.env.PORT || 4000
server.listen(PORT, () => {
    console.log(`Server up on PORT ${PORT}`)
})