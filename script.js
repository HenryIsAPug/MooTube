const auth = firebase.auth();
const db = firebase.firestore();

// Upload image to Imgur
async function uploadImageToImgur(file) {
  const clientId = '4f707c20868a7d7'; // Your Imgur Client ID
  const formData = new FormData();
  formData.append('image', file);

  try {
    const response = await fetch('https://api.imgur.com/3/image', {
      method: 'POST',
      headers: {
        Authorization: `Client-ID ${clientId}`
      },
      body: formData
    });
    const data = await response.json();
    if (data.success) {
      return data.data.link;
    } else {
      throw new Error('Imgur upload failed');
    }
  } catch (error) {
    console.error('Error uploading to Imgur:', error);
    alert('Image upload failed!');
    return null;
  }
}

// Submit post handler
async function submitPost(e) {
  e.preventDefault();

  const postText = document.getElementById('postText').value.trim();
  const fileInput = document.getElementById('imageInput');
  const file = fileInput?.files[0];

  if (!postText && !file) {
    alert("Please write something or upload an image!");
    return;
  }

  const currentUser = auth.currentUser;
  if (!currentUser) {
    alert("You must be logged in to post!");
    return;
  }

  let imageUrl = null;
  if (file) {
    imageUrl = await uploadImageToImgur(file);
    if (!imageUrl) {
      // upload failed, stop posting
      return;
    }
  }

  try {
    await db.collection('posts').add({
      text: postText,
      imageUrl: imageUrl || null,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      author: currentUser.uid
    });

    // Clear the form fields
    document.getElementById('postText').value = '';
    fileInput.value = '';

    // Refresh the feed immediately
    loadFeed();
  } catch (err) {
    console.error("Error posting:", err);
    alert("Something went wrong posting.");
  }
}

// Load feed function (keeps your feed updated)
function loadFeed() {
  const feed = document.getElementById('feed');
  db.collection('posts')
    .orderBy('createdAt', 'desc')
    .onSnapshot(snapshot => {
      feed.innerHTML = '';
      snapshot.forEach(doc => {
        const post = doc.data();
        const postDiv = document.createElement('div');
        postDiv.classList.add('post');

        const text = document.createElement('p');
        text.textContent = post.text;
        postDiv.appendChild(text);

        if (post.imageUrl) {
          const img = document.createElement('img');
          img.src = post.imageUrl;
          img.alt = "Post image";
          postDiv.appendChild(img);
        }

        feed.appendChild(postDiv);
      });
    });
}

// Setup everything on window load
window.onload = () => {
  auth.onAuthStateChanged(user => {
    if (user) {
      loadFeed();
    } else {
      alert("Log in to view and post in the feed!");
    }
  });

  const form = document.getElementById('postForm');
  if (form) {
    form.addEventListener('submit', submitPost);
  }
};

// Auto-run on page load
window.onload = () => {
  auth.onAuthStateChanged(user => {
    if (user) {
      loadFeed();
    } else {
      alert("Log in to view and post in the feed!");
    }
  });
};

async function addFriend() {
  const username = document.getElementById("friendUsername").value.trim();
  const user = auth.currentUser;
  if (!username) return alert("Enter a username!");
  if (!user) return alert("Please log in!");

  // Check if user exists
  const query = await db.collection("users").where("username", "==", username).get();
  if (query.empty) return alert("User not found 😢");

  const friendDoc = query.docs[0];
  const friendId = friendDoc.id;

  if (friendId === user.uid) return alert("You can’t friend yourself, silly! 🐮");

  // Check if already friends
  const userDoc = await db.collection("users").doc(user.uid).get();
  if ((userDoc.data().friends || []).includes(friendId)) {
    return alert("You’re already friends!");
  }

  // Check if a pending request already exists
  const existingRequestsQuery = await db.collection("friendRequests")
    .where("from", "==", user.uid)
    .where("to", "==", friendId)
    .where("status", "==", "pending")
    .get();

  if (!existingRequestsQuery.empty) {
    return alert("Friend request already sent!");
  }

  // Create new friend request
  await db.collection("friendRequests").add({
    from: user.uid,
    to: friendId,
    status: "pending",
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });

  alert("Friend request sent! 🐮💌");
}

if (window.location.pathname.includes("friends.html")) {
  auth.onAuthStateChanged(async (user) => {
    if (!user) return window.location.href = "index.html";

    const userRef = db.collection("users").doc(user.uid);

    // Load current friends
    const doc = await userRef.get();
    const data = doc.data() || {};
    const friendList = data.friends || [];
    const ul = document.getElementById("friendList");
    ul.innerHTML = "";
    for (const friendId of friendList) {
      const friendDoc = await db.collection("users").doc(friendId).get();
      const friendName = friendDoc.data()?.username || "Unknown Moo";
      const li = document.createElement("li");
      li.textContent = friendName;
      ul.appendChild(li);
    }

    // Load friend requests
    const reqUl = document.getElementById("friendRequests");
    reqUl.innerHTML = "";

    const requestsQuery = await db.collection("friendRequests")
      .where("to", "==", user.uid)
      .where("status", "==", "pending")
      .get();

    const notificationCount = document.getElementById("notificationCount");
    const notificationBell = document.getElementById("notificationBell");

    if (requestsQuery.size > 0) {
      notificationCount.style.display = "inline-block";
      notificationCount.textContent = requestsQuery.size;
      notificationBell.style.color = "#ff4500";
    } else {
      notificationCount.style.display = "none";
      notificationBell.style.color = "#ff7f50";
    }

    requestsQuery.forEach(async (reqDoc) => {
      const reqData = reqDoc.data();
      const fromUserDoc = await db.collection("users").doc(reqData.from).get();
      const fromUsername = fromUserDoc.data()?.username || "Mystery Moo";

      const li = document.createElement("li");
      li.textContent = fromUsername + " wants to be your friend ";

      const acceptBtn = document.createElement("button");
      acceptBtn.textContent = "Accept";
      acceptBtn.onclick = async () => {
        await userRef.update({
          friends: firebase.firestore.FieldValue.arrayUnion(reqData.from)
        });
        await db.collection("users").doc(reqData.from).update({
          friends: firebase.firestore.FieldValue.arrayUnion(user.uid)
        });
        await db.collection("friendRequests").doc(reqDoc.id).update({ status: "accepted" });
        alert("You’re now friends! 🐮🤝🐮");
        location.reload();
      };

      const declineBtn = document.createElement("button");
      declineBtn.textContent = "Decline";
      declineBtn.onclick = async () => {
        await db.collection("friendRequests").doc(reqDoc.id).update({ status: "declined" });
        alert("Friend request declined.");
        location.reload();
      };

      li.appendChild(acceptBtn);
      li.appendChild(declineBtn);
      reqUl.appendChild(li);
    });

    notificationBell.onclick = () => {
      reqUl.scrollIntoView({ behavior: "smooth" });
    };

    // Attach addFriend to button here
    const btn = document.getElementById("sendFriendRequestBtn");
    if (btn) btn.addEventListener("click", addFriend);
  });
}

function signup() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  auth.createUserWithEmailAndPassword(email, password)
    .then((userCredential) => {
      const user = userCredential.user;
      const username = email.split("@")[0]; // simple default username
      return db.collection("users").doc(user.uid).set({
        email,
        username,
        friends: []
      });
    })
    .then(() => {
      alert("Signed up! 🐮");
      window.location.href = "profile.html"; // or wherever your dashboard is!
    })
    .catch((error) => {
      alert("Signup error: " + error.message);
    });
}

function login() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  auth.signInWithEmailAndPassword(email, password)
    .then(() => {
      alert("Welcome back, Mooer!");
      window.location.href = "profile.html";
    })
    .catch((error) => {
      alert("Login error: " + error.message);
    });
}

window.signup = signup;
window.login = login;

if (window.location.pathname.includes("messages.html")) {
  auth.onAuthStateChanged(async (user) => {
    if (!user) return window.location.href = "index.html";

    const inbox = document.getElementById("inbox");

    // Real-time listener for inbox messages
    db.collection("messages")
      .where("to", "==", user.uid)
      .orderBy("timestamp", "desc")
      .onSnapshot(async (snapshot) => {
        inbox.innerHTML = "";
        for (const doc of snapshot.docs) {
          const msg = doc.data();
          const fromDoc = await db.collection("users").doc(msg.from).get();
          const fromName = fromDoc.data()?.username || "Unknown Moo";

          const li = document.createElement("li");
          const time = msg.timestamp?.toDate().toLocaleString() || "⏳";
          li.textContent = `📨 ${time} - From ${fromName}: ${msg.text}`;
          inbox.appendChild(li);
        }
        inbox.scrollTop = inbox.scrollHeight;
      });
  });

  async function sendMessage() {
    const user = auth.currentUser;
    const toUsername = document.getElementById("messageTo").value.trim();
    const messageText = document.getElementById("messageText").value.trim();
    const sendButton = document.querySelector("button[onclick='sendMessage()']");

    if (!user || !toUsername || !messageText) {
      return alert("Please fill in all fields!");
    }

    sendButton.disabled = true;
    sendButton.textContent = "Sending...";

    // Find recipient UID
    const userQuery = await db.collection("users")
      .where("username", "==", toUsername)
      .get();

    if (userQuery.empty) {
      alert("No Highland Cow with that username! 🐄🤔");
      sendButton.disabled = false;
      sendButton.textContent = "Send Message";
      return;
    }

    const toUID = userQuery.docs[0].id;

    await db.collection("messages").add({
      from: user.uid,
      to: toUID,
      text: messageText,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });

    alert("Message sent! 📬🐮");
    document.getElementById("messageText").value = "";

    sendButton.disabled = false;
    sendButton.textContent = "Send Message";
  }

  window.sendMessage = sendMessage;
}

if (window.location.pathname.includes("profile.html")) {
  auth.onAuthStateChanged(async (user) => {
    if (!user) return window.location.href = "index.html";

    const usernameInput = document.getElementById("username");
    const bioInput = document.getElementById("bio");
    const profilePicInput = document.getElementById("profilePic");
    const statusDiv = document.getElementById("status");
    const mooPointsSpan = document.getElementById("mooPoints");
    const currentPicImg = document.getElementById("currentPic");

    // Load user profile info
    const userDoc = await db.collection("users").doc(user.uid).get();
    const data = userDoc.data() || {};
    usernameInput.value = data.username || "";
    bioInput.value = data.bio || "";
    mooPointsSpan.textContent = data.mooPoints || 0;

    if (data.photoURL) {
      currentPicImg.src = data.photoURL;
    } else {
      currentPicImg.src = "default.png";
    }

    // Define global saveProfile function for button onclick
    window.saveProfile = async function() {
      statusDiv.textContent = "Saving your moo profile... 🐮💾";
      try {
        let photoURL = data.photoURL || "";

        if (profilePicInput && profilePicInput.files.length > 0) {
          const file = profilePicInput.files[0];
          const storageRef = storage.ref();
          const picRef = storageRef.child(`profilePics/${user.uid}/${file.name}`);
          await picRef.put(file);
          photoURL = await picRef.getDownloadURL();
        }

        await db.collection("users").doc(user.uid).set({
          username: usernameInput.value.trim(),
          bio: bioInput.value.trim(),
          photoURL,
        }, { merge: true });

        statusDiv.textContent = "Profile updated! Moo-tastic! 🐄✨";
        currentPicImg.src = photoURL || currentPicImg.src;
      } catch (err) {
        statusDiv.textContent = "Uh-oh, error saving profile: " + err.message;
      }
    };

  });  // end auth.onAuthStateChanged for profile.html
}     // end if (window.location.pathname.includes("profile.html"))

const postForm = document.getElementById('postForm');
const postText = document.getElementById('postText');
const postImage = document.getElementById('postImage');
const feedContainer = document.getElementById('feedContainer');

let currentUser = null;

firebase.auth().onAuthStateChanged(user => {
  if (user) {
    currentUser = user;
    loadFeed();
  } else {
    feedContainer.innerHTML = "<p>Login to view moos!</p>";
  }
});

postForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = postText.value.trim();
  const file = postImage.files[0];

  if (!text && !file) return;

  const userDoc = await firebase.firestore().collection('users').doc(currentUser.uid).get();
  const userData = userDoc.data();
  let imageUrl = "";

  if (file) {
    const storageRef = firebase.storage().ref();
    const imgRef = storageRef.child(`post_images/${Date.now()}_${file.name}`);
    await imgRef.put(file);
    imageUrl = await imgRef.getDownloadURL();
  }

  await firebase.firestore().collection('posts').add({
    userId: currentUser.uid,
    username: userData.username || "Mystery Cow",
    profilePicUrl: userData.profilePic || "",
    text: text,
    imageUrl,
    timestamp: Date.now(),
    reactions: {},
    comments: []
  });

  postText.value = "";
  postImage.value = "";
});

function loadFeed() {
  firebase.firestore().collection('posts').orderBy('timestamp', 'desc')
    .onSnapshot(snapshot => {
      feedContainer.innerHTML = "";
      snapshot.forEach(doc => {
        const post = doc.data();
        const postId = doc.id;
        const postEl = document.createElement('div');
        postEl.className = 'post';

        // Emojis
        const emojis = ["❤️", "😂", "🌾"];
        let reactionsHTML = emojis.map(emoji => {
          const count = post.reactions?.[emoji] || 0;
          return `<span data-emoji="${emoji}" data-id="${postId}">${emoji} ${count}</span>`;
        }).join("");

        // Comments
        const commentsHTML = (post.comments || []).map(c => `
          <div class="comment"><strong>${c.user}:</strong> ${c.text}</div>
        `).join("");

        postEl.innerHTML = `
          <img src="${post.profilePicUrl}" class="pfp"> 
          <strong>${post.username}</strong>
          ${post.userId === currentUser.uid ? `<button class="delete-btn" data-id="${postId}">Delete</button>` : ""}
          <p>${post.text}</p>
          ${post.imageUrl ? `<img src="${post.imageUrl}" class="uploaded-img">` : ""}
          <div class="reactions">${reactionsHTML}</div>
          <div class="comment-box">
            ${commentsHTML}
            <input type="text" placeholder="Add a comment..." data-id="${postId}" class="comment-input">
            <button data-id="${postId}" class="comment-btn">Comment</button>
          </div>
          <small>${new Date(post.timestamp).toLocaleString()}</small>
        `;

        feedContainer.appendChild(postEl);
      });

      setupListeners();
    });
}

function setupListeners() {
  // Reaction Click
  document.querySelectorAll('.reactions span').forEach(span => {
    span.addEventListener('click', async () => {
      const emoji = span.getAttribute('data-emoji');
      const postId = span.getAttribute('data-id');
      const postRef = firebase.firestore().collection('posts').doc(postId);
      const postDoc = await postRef.get();
      const postData = postDoc.data();
      const reactions = postData.reactions || {};
      reactions[emoji] = (reactions[emoji] || 0) + 1;
      await postRef.update({ reactions });
    });
  });

  // Comment Click
  document.querySelectorAll('.comment-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const postId = btn.getAttribute('data-id');
      const input = document.querySelector(`.comment-input[data-id="${postId}"]`);
      const text = input.value.trim();
      if (!text) return;
      const postRef = firebase.firestore().collection('posts').doc(postId);
      const postDoc = await postRef.get();
      const comments = postDoc.data().comments || [];
      const userDoc = await firebase.firestore().collection('users').doc(currentUser.uid).get();
      const username = userDoc.data().username || "MooGuest";
      comments.push({ user: username, text });
      await postRef.update({ comments });
      input.value = "";
    });
  });

  // Delete Button
  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const postId = btn.getAttribute('data-id');
      if (confirm("Are you sure you want to delete this moo?")) {
        await firebase.firestore().collection('posts').doc(postId).delete();
      }
    });
  });
}