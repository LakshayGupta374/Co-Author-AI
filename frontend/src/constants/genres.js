export const ALL_GENRES = [
  "Fantasy", "Science Fiction", "Mystery", "Romance", "Horror",
  "Thriller", "Adventure", "Historical", "Comedy", "Drama",
  "Dystopian", "Mythology", "Crime", "Supernatural", "Western",
];

export const GENRE_COLORS = [
  "#6c63ff", "#e84393", "#ff6b35", "#00b894", "#0984e3",
  "#6c5ce7", "#fd79a8", "#00cec9", "#e17055", "#a29bfe",
  "#55efc4", "#fdcb6e", "#74b9ff", "#fab1a0", "#81ecec",
];

export const genreColor = (genre) =>
  GENRE_COLORS[ALL_GENRES.indexOf(genre) % GENRE_COLORS.length] || "#6c63ff";
