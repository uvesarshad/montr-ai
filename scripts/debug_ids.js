const mongoose = require('mongoose');

async function debug() {
    await mongoose.connect('mongodb://localhost:27017/montrai');
    const db = mongoose.connection.db;

    const user = await db.collection('users').findOne({ email: 'uveskhan234@gmail.com' });
    if (!user) {
        console.log('User uveskhan234@gmail.com not found');
        return;
    }
    console.log('User found:', user.email);
    console.log('User _id:', user._id.toString());
    console.log('User firebaseUid:', user.firebaseUid);

    // Check canvases ownership
    const query = {
        $or: [
            { userId: user._id.toString() }
        ]
    };

    if (user.firebaseUid) {
        query.$or.push({ userId: user.firebaseUid });
    }

    const canvases = await db.collection('canvases').find(query).toArray();

    console.log('\nTotal Canvases:', canvases.length);
    canvases.forEach(c => {
        console.log(`- "${c.name}" (userId: ${c.userId})`);
    });

    const docs = await db.collection('documents').find(query).toArray();
    console.log('\nTotal Documents:', docs.length);
    docs.forEach(d => {
        console.log(`- "${d.title}" (userId: ${d.userId})`);
    });

    await mongoose.disconnect();
}

debug().catch(console.error);
