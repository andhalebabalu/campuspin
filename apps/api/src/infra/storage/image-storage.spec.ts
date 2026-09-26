import { LocalDiskImageStorage } from './image-storage.js';

describe('LocalDiskImageStorage.owns', () => {
  const storage = new LocalDiskImageStorage('unused', 'http://localhost:4000');
  const name = '0f0c7a52-3a4c-4c4f-9a50-8a2f0b0d8e11';

  it('recognises files it named and serves', () => {
    expect(storage.owns(`http://localhost:4000/uploads/${name}.jpg`)).toBe(true);
    expect(storage.owns(`http://localhost:4000/uploads/${name}.webp`)).toBe(true);
  });

  it('refuses outside hosts, other paths and names it would never produce', () => {
    expect(storage.owns(`https://tracker.example.com/uploads/${name}.jpg`)).toBe(false);
    expect(storage.owns(`http://localhost:4000/private/${name}.jpg`)).toBe(false);
    expect(storage.owns('http://localhost:4000/uploads/../secret.jpg')).toBe(false);
    expect(storage.owns(`http://localhost:4000/uploads/${name}.php`)).toBe(false);
    expect(storage.owns(`http://localhost:4000/uploads/${name}.jpg?x=1`)).toBe(false);
  });
});
