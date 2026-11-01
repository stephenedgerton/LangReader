// Names to mark Ignored on first launch, so they're never blue (LingQ users ignore names by hand).
// Names that are also everyday words are left out on purpose: Rosa, Bianca, Chiara, Felice,
// Serena, Stella, Franco, Bruno, Massimo, Guido, Rossi, Conti, Russo, Mancini, Fabbri …
// Bump NAMES_VERSION after adding names, so existing installs pick up the new ones.
export const NAMES_VERSION = 2;

const FIRST = `Achille Adele Adriana Agnese Alberto Aldo Alessandra Alessandro Alessia Alessio Alfonso Alfredo
  Alice Amedeo Andrea Angela Anna Annalisa Annamaria Antonella Antonio Arianna Arturo Augusto Bartolomeo
  Beatrice Beppe Biagio Camilla Carla Carlo Carlotta Carmela Caterina Cecilia Cesare Ciro Clara Claudia
  Claudio Concetta Corrado Cristina Daniela Daniele Dante Dario Davide Debora Diego Domenico Donatella
  Edoardo Elena Eleonora Elia Elio Elisa Elisabetta Emanuele Emilio Emma Enrico Enzo Ercole Ettore Ezio
  Fabio Fabrizio Federica Federico Filippo Filomena Flavio Francesca Francesco Gabriele Gabriella Gaetano
  Gaspare Gennaro Giacomo Giancarlo Gianluca Gianmarco Gianna Gianni Gigi Gino Ginevra Giorgia Giorgio
  Giovanna Giovanni Giulia Giuliana Giulio Giuseppe Giuseppina Graziella Ignazio Ilaria Irene Isabella
  Ivana Jacopo Laura Lena Leonardo Lidia Liliana Livia Livio Lorena Lorenza Lorenzo Loredana Luca Lucia
  Luciana Luciano Lucio Ludovica Luigi Luisa Manuel Manuela Marcello Marco Maria Mariella Marisa Mario
  Marta Martina Matilde Matteo Mattia Mauro Maurizio Michela Michele Mirella Monica Nadia Natalia Niccolò
  Nicola Nicoletta Nicolò Nina Nino Noemi Orazio Ornella Osvaldo Ottavio Paola Paolo Pasquale Patrizia
  Peppe Piera Piero Pietro Pippo Raffaele Raffaella Raimondo Rebecca Renato Riccardo Rita Roberta
  Roberto Rocco Rodolfo Romeo Rossella Ruggiero Sabrina Salvatore Samuele Sandra Sandro Sara Saverio
  Sergio Severino Silvana Silvia Silvio Simona Simone Sofia Stefania Stefano Teodoro Teresa Tiziana
  Tiziano Tommaso Tonino Totò Ugo Umberto Valentina Valentino Valeria Valerio Vanessa Veronica Vincenzo
  Vito Vittorio Wanda`;

const SURNAMES = `Basile Bellini Bernardi Caputo Caruso Cattaneo Coppola Costantini Esposito
  Ferrante Ferrari Ferraro Giordano Giuliani Longo Marchetti Mariani
  Martinelli Messina Milani Morelli Moretti Palmieri Palumbo Parisi Piras Rinaldi
  Rizzi Rizzo Sanna Santoro Sartori Sorrentino Valentini`;

// Characters and places in the bundled stories (samples/).
const STORIES = `Moser Varga Okafor Ulisse Galileo Bologna Torino Milano Napoli Sicilia Giove Dolomiti Vallerosa
  Kate Morley Montemare Bristol Genova Liguria Inghilterra Italia Weber`;

export const NAMES = [...new Set(`${FIRST} ${SURNAMES} ${STORIES}`.split(/\s+/).filter(Boolean))];
