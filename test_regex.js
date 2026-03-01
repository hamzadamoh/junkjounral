const title = 'Whimsical Cartoon Cat Junk Journal Kit';
const term = 'kit';
const regex = new RegExp(`\\b${term}\\b`, 'i');
console.log(regex.test(title));
