// Hand-picked themes for the Stats tab, as lemmas (dictionary forms) from data/freq-it-v1.json.
// Words missing from that list are dropped when the stats are worked out.
const T = (id, name, icon, words) => ({ id, name, icon, words: words.trim().split(/\s+/) });

export const THEMES = [
  T('food', 'Food & drink', '🍝', `
    pane vino acqua caffè latte carne pesce frutta uovo formaggio zucchero sale olio burro minestra pasta riso
    pranzo cena colazione tavola piatto bicchiere bottiglia cucchiaio forchetta coltello tazza cibo fame sete
    mangiare bere cucinare assaggiare gustare dolce amaro birra liquore frutto mela arancia uva pomodoro
    insalata zuppa arrosto pollo vitello salame prosciutto torta biscotto cioccolata tè bottega osteria trattoria
    cuoco cucina forno pentola fiasco brodo gelato pepe aceto limone fico ciliegia patata fagiolo cipolla`),
  T('home', 'Home', '🏠', `
    casa stanza camera porta finestra muro tetto scala letto sedia tavolo tavola armadio specchio lampada
    cucina salotto sala giardino cortile cancello chiave pavimento soffitto parete tenda cuscino coperta lenzuolo
    fuoco camino candela focolare balcone terrazza cantina soffitta corridoio uscio soglia mobile poltrona divano
    quadro tappeto scaffale cassetto baule vaso orologio campanello abitare appartamento villa palazzo dimora`),
  T('family', 'Family', '👪', `
    famiglia padre madre figlio figlia fratello sorella marito moglie nonno nonna zio zia cugino nipote
    bambino bambina babbo mamma papà genitore parente sposo sposa suocera cognato fidanzato fidanzata
    vedova vedovo orfano erede gemello neonato infanzia nozze matrimonio battesimo culla sposare nascere
    crescere educare allevare figliuolo fanciullo fanciulla ragazzo ragazza giovane vecchio antenato`),
  T('body', 'The body', '🫀', `
    corpo testa viso faccia occhio orecchio naso bocca labbro dente lingua collo spalla braccio mano dito
    gamba piede ginocchio petto cuore schiena pelle capello fronte guancia mento sangue osso ventre stomaco
    unghia polso gola fianco seno ciglio palpebra tempia nuca gomito pugno respiro voce sguardo lacrima
    sudore carne nervo muscolo cervello polmone`),
  T('health', 'Health & illness', '🩺', `
    salute malattia malato medico ospedale febbre dolore ferita male tosse medicina rimedio guarire curare
    soffrire morire morte morto vivo vita sano debole stanco stanchezza svenire cura infermiere
    farmacia veleno pallido sofferenza ammalare letto riposo sonno dormire svegliare sogno fatica debolezza
    convalescenza contagio peste agonia funerale cimitero tomba lutto`),
  T('clothes', 'Clothing', '👗', `
    vestito abito veste camicia giacca cappotto mantello gonna calza scarpa stivale cappello guanto cravatta
    tasca bottone cintura sciarpa scialle velo seta lana cotone tela velluto pizzo merletto stoffa
    vestire spogliare indossare portare cucire sarto moda elegante anello collana orecchino gioiello perla
    ombrello bastone borsa fazzoletto grembiule pantalone uniforme`),
  T('feelings', 'Feelings', '💭', `
    amore odio paura gioia dolore tristezza felicità rabbia ira gelosia vergogna speranza disperazione
    pietà orgoglio noia ansia angoscia sorpresa piacere desiderio passione affetto tenerezza nostalgia rimorso
    felice triste contento allegro arrabbiato geloso nervoso tranquillo calmo inquieto commosso sereno
    amare odiare temere sperare piangere ridere sorridere soffrire godere sospirare tremare emozione
    sentimento cuore anima lacrima sorriso riso pianto sospiro malinconia orrore terrore spavento`),
  T('character', 'Character', '🧑', `
    buono cattivo bravo onesto sincero falso gentile cortese crudele generoso avaro superbo umile timido
    coraggioso vile forte debole intelligente sciocco stupido saggio furbo pazzo savio prudente pigro
    ambizioso fedele leale curioso paziente modesto vanitoso ingenuo serio allegro severo dolce rozzo
    carattere virtù vizio onore orgoglio coraggio pazienza bontà malvagità ingegno spirito indole`),
  T('time', 'Time', '⏰', `
    tempo ora minuto secondo momento attimo giorno notte mattina mattino sera pomeriggio settimana mese
    anno secolo epoca oggi ieri domani dopodomani presto tardi sempre mai spesso ancora già subito poi prima
    dopo mentre allora adesso intanto durante lunedì martedì mercoledì giovedì venerdì sabato domenica
    gennaio febbraio marzo aprile maggio giugno luglio agosto settembre ottobre novembre dicembre
    alba tramonto mezzogiorno mezzanotte orologio passato futuro presente festa vacanza`),
  T('weather', 'Weather & seasons', '☀️', `
    tempo sole pioggia neve vento nebbia nuvola tempesta temporale fulmine tuono lampo cielo aria
    caldo freddo fresco umido gelo ghiaccio rugiada clima stagione primavera estate autunno inverno
    piovere nevicare soffiare splendere sereno nuvoloso grigio tiepido gelido afa arcobaleno uragano
    burrasca bufera goccia ombra luce raggio`),
  T('nature', 'Nature', '🌳', `
    natura terra mare montagna monte collina valle pianura fiume lago torrente ruscello sorgente onda spiaggia
    riva costa isola bosco foresta albero ramo foglia fiore erba prato campo campagna sasso pietra roccia
    sabbia deserto cielo stella luna sole orizzonte paesaggio sentiero grotta abisso vulcano rosa giglio
    quercia pino olivo cipresso castagno vite grano seme radice tronco frutto selva palude`),
  T('animals', 'Animals', '🐾', `
    animale bestia cane gatto cavallo asino mulo bue mucca vacca toro pecora capra maiale porco gallina
    gallo pollo uccello passero rondine colomba aquila corvo pesce serpente topo lupo volpe orso leone
    tigre scimmia elefante cervo lepre coniglio mosca zanzara ape farfalla formica ragno verme rana
    gregge stalla nido ala penna piuma zampa coda pelo artiglio corno cacciare caccia cacciatore pastore`),
  T('city', 'Town & city', '🏙️', `
    città paese villaggio borgo quartiere via strada piazza vicolo viale corso ponte chiesa palazzo
    castello torre municipio negozio bottega mercato albergo caffè teatro museo scuola ospedale prigione
    stazione porto fontana giardino parco muro cancello marciapiede angolo folla gente abitante cittadino
    traffico lampione insegna vetrina campanile cattedrale convento caserma banca ufficio fabbrica`),
  T('travel', 'Travel & transport', '🚆', `
    viaggio viaggiare partire arrivare partenza arrivo tornare ritorno treno stazione biglietto carrozza
    vettura cavallo nave barca battello porto vela automobile bicicletta tram strada via cammino sentiero
    valigia bagaglio baule albergo locanda passeggero viaggiatore conducente cocchiere marinaio frontiera
    straniero estero paese carta guida lontano vicino distanza chilometro miglio passaporto dogana
    salire scendere guidare camminare correre fermare aspettare`),
  T('work', 'Work & jobs', '💼', `
    lavoro lavorare mestiere professione impiego ufficio fabbrica operaio contadino padrone servo serva
    cameriere impiegato medico avvocato notaio maestro professore giudice soldato ufficiale capitano
    prete frate monaco suora mercante commerciante negoziante bottegaio artigiano fabbro falegname sarto
    calzolaio pittore scrittore poeta giornalista ingegnere architetto banchiere ministro segretario
    direttore capo paga stipendio guadagnare fatica affare compito dovere occupazione`),
  T('money', 'Money & shopping', '💶', `
    denaro soldo moneta lira centesimo ricco povero ricchezza miseria povertà prezzo costo pagare costare
    comprare vendere spendere guadagnare risparmiare prestare debito credito conto banca borsa fortuna
    eredità tassa affitto negozio bottega mercato cliente merce valore caro economico affare commercio
    regalo dono cambiare contare oro argento tesoro capitale interesse`),
  T('learning', 'School & learning', '📚', `
    scuola maestro maestra professore scolaro studente allievo lezione classe esame studio studiare imparare
    insegnare sapere conoscere leggere scrivere libro quaderno penna matita carta pagina parola lettera
    lingua grammatica storia geografia scienza matematica università collegio dottore biblioteca dizionario
    compito errore domanda risposta spiegare capire ricordare dimenticare memoria intelligenza educazione`),
  T('arts', 'Arts & books', '🎭', `
    arte artista libro romanzo racconto novella poesia poeta verso scrittore autore pagina capitolo storia
    teatro attore attrice scena commedia tragedia dramma musica musicista canzone canto cantare suonare
    pianoforte violino opera pittura pittore quadro ritratto statua scultore bellezza stile ballo danza
    ballare concerto spettacolo pubblico applauso giornale rivista lettore`),
  T('colours', 'Colours & looks', '🎨', `
    colore bianco nero rosso verde azzurro blu giallo grigio bruno castano biondo roseo rosa viola
    chiaro scuro pallido bello brutto grande piccolo alto basso grosso magro grasso lungo corto largo
    stretto giovane vecchio forma aspetto figura bellezza elegante splendido luminoso brillante opaco`),
  T('numbers', 'Numbers & amounts', '🔢', `
    uno due tre quattro cinque sette otto nove dieci undici dodici venti trenta quaranta cinquanta
    cento mille milione primo secondo terzo ultimo mezzo metà doppio paio numero quantità molto poco
    tanto troppo abbastanza più meno tutto nessuno ogni alcuno parecchio intero parte pezzo contare
    misura peso metro chilo litro dozzina centinaio migliaio`),
  T('place', 'Place & movement', '🧭', `
    andare venire tornare entrare uscire salire scendere correre camminare fermare girare voltare passare
    seguire raggiungere avvicinare allontanare cadere alzare muovere spingere tirare portare mettere
    sopra sotto dentro fuori davanti dietro accanto vicino lontano qui qua lì là dove destra sinistra
    alto basso mezzo centro fondo lato angolo punto luogo direzione verso attraverso lungo intorno`),
  T('speech', 'Talking', '🗣️', `
    dire parlare chiedere domandare rispondere raccontare spiegare gridare urlare chiamare mormorare
    sussurrare esclamare ripetere tacere ascoltare sentire udire salutare ringraziare pregare promettere
    giurare mentire discutere conversare chiacchierare litigare scrivere leggere parola frase voce
    discorso conversazione domanda risposta grido silenzio lettera notizia segreto bugia verità nome
    lingua accento tono`),
  T('mind', 'Thinking', '🧠', `
    pensare credere sapere conoscere capire ricordare dimenticare immaginare sognare decidere scegliere
    sperare dubitare supporre accorgere riflettere considerare giudicare intendere volere desiderare
    pensiero idea mente memoria ricordo sogno dubbio ragione opinione giudizio coscienza volontà intenzione
    scopo motivo causa problema questione verità errore certo sicuro possibile impossibile vero falso`),
  T('love', 'Love & friendship', '❤️', `
    amore amare amico amica amicizia innamorato innamorare fidanzato fidanzata sposo sposa matrimonio nozze
    bacio baciare abbraccio abbracciare carezza accarezzare cuore passione desiderio tenerezza gelosia
    tradire tradimento fedele fedeltà amante caro compagno compagna incontro appuntamento lettera
    promessa anello sposare lasciare dimenticare perdonare solitudine solo felicità`),
  T('society', 'Society & law', '⚖️', `
    società popolo gente nazione patria paese governo re regina principe principessa conte contessa
    marchese duca barone signore signora nobile borghese contadino legge giudice tribunale processo
    avvocato colpa delitto ladro assassino prigione carcere polizia guardia giustizia diritto dovere potere
    libertà politica partito elezione deputato sindaco ministro guerra pace`),
  T('faith', 'Faith', '⛪', `
    dio signore cielo paradiso inferno anima spirito santo angelo diavolo demonio chiesa messa prete
    frate monaco suora papa vescovo parroco convento preghiera pregare croce altare fede peccato
    benedire benedetto miracolo madonna cristo vangelo campana religione sacro devoto destino`),
];
