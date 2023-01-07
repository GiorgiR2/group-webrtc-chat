var localStream;
// var remoteStreams = []; //[[stream, id], ]

var peerConnections = []; // [[RTCPeerConnection, id], ]

var socket = io.connect("http://localhost:5000/");

const servers = {
  iceServers: [
    {
      urls: ["stun:stun1.l.google.com:19302", "stun:stun2.l.google.com:19302"],
    },
  ],
};

const init = async () => {
  // navigator.mediaDevices
  //   .getUserMedia({ video: true, audio: false })
  //   .then((stream) => {
  //     localStream = stream;
  //     document.getElementById("user-1").srcObject = localStream;
  //   });
  localStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: false,
  });
  document.getElementById("user-1").srcObject = localStream;
};

const generateIceCandidates = async (id) => {
  // this will be triggered after we create the offer and setLocalDescription(offer)
  // after this we are going to send the offer with all iceCandidates using sockets
  peerConnections.forEach((peerConnection) => {
    if (peerConnection[1] === id) {
      peerConnection[0].onicecandidate = async (event) => {
        socket.emit("candidate", {
          text: JSON.stringify({
            type: "candidate",
            candidate: event.candidate,
          }),
          id: id,
        });
      };
    }
  });
};

const createPeerConnection = async (toId, id) => {
  // common part of createOffer and createAnswer functions
  let pc = new RTCPeerConnection(servers);
  peerConnections.push([pc, id]);

  let rs = new MediaStream(); // empty stream
  // remoteStreams.push([rs, id]);

  document.getElementById(`user-${peerConnections.length + 1}`).srcObject = rs; //remoteStreams[remoteStreams.length - 1][0];
  // document.getElementById(`user-${usersN}`).style.display = "block";

  if (!localStream) {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false,
    });
    document.getElementById("user-1").srcObject = localStream;
  }

  await generateIceCandidates(id);

  // send local streams
  localStream.getTracks().forEach((track) => {
    pc.addTrack(track, localStream);
    // peerConnections.forEach((peerConnection) => {
    //   if (peerConnection[1] === id) {
    //     peerConnection[0].addTrack(track, localStream);
    //   }
    // });
  });

  // receive remote streams
  peerConnections.forEach((peerConnection) => {
    // if (peerConnection[1] === id) {
    pc.ontrack = (event) => {
      event.streams[0].getTracks().forEach((track) => {
        // remoteStreams[remoteStreams.length-1][0].addTrack(track);
        // remoteStreams.forEach((remoteStream) => {
        // if (remoteStream[1] === id) {
        rs.addTrack(track);
        // remoteStream[0].addTrack(track);
        // }
        // });
      });
    };
    // }
  });
};

const createOffer = async (toId, fromId) => {
  await createPeerConnection(toId, fromId);

  // create offer
  peerConnections.forEach(async (peerConnection) => {
    if (peerConnection[1] === fromId) {
      let offer = await peerConnection[0].createOffer();
      await peerConnection[0].setLocalDescription(offer);
      socket.emit("offer", {
        text: JSON.stringify({ type: "offer", offer: offer }),
        id: fromId,
      });
    }
  });
};

const createAnswer = async (offer, toId, fromId) => {
  await createPeerConnection(toId, fromId);

  peerConnections.forEach(async (peerConnection) => {
    if (peerConnection[1] === fromId) {
      await peerConnection[0].setRemoteDescription(offer);
      let answer = await peerConnection[0].createAnswer();
      await peerConnection[0].setLocalDescription(answer);
      socket.emit("answer", {
        text: JSON.stringify({ type: "answer", answer: answer }),
        to: fromId,
      });
    }
  });
};

const addAnswer = async (answer, id) => {
  peerConnections.forEach((peerConnection) => {
    if (peerConnection[1] === id) {
      // && !peerConnection[0].currentRemoteDescription){
      peerConnection[0].setRemoteDescription(answer);
    }
  });
};

const handleMessageFromPeer = async (text, fromId) => {
  let msg = JSON.parse(text);
  if (msg.type === "offer") {
    await createAnswer(msg.offer, fromId[0], fromId[1]);
  } else if (msg.type === "candidate") {
    peerConnections.forEach(async (peerConnection) => {
      if (peerConnection[1] === fromId) {
        await peerConnection[0].addIceCandidate(msg.candidate);
      }
    });
  } else if (msg.type === "answer") {
    await addAnswer(msg.answer, fromId);
  }
};

init();

const handleUserJoined = (toId, fromId) => {
  // console.log("A remote peer joined...", id);
  createOffer(toId, fromId);
};

socket.on("joined", (data) => {
  handleUserJoined(data.to, data.from);
});

socket.on("offer", (data) => {
  console.log("receive offer from:", data.from);
  handleMessageFromPeer(data.text, [data.to, data.from]);
});

socket.on("candidate", (data) => {
  console.log("receive ice candidate from:", data.from);
  handleMessageFromPeer(data.text, data.from);
});

socket.on("answer", (data) => {
  console.log("receive answer from:", data.from);
  handleMessageFromPeer(data.text, data.from);
});

socket.on("peerDisconnected", (data) => {
  // document.getElementById("user-2").style.display = "none";
});
