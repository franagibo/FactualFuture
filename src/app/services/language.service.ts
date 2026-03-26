import { Injectable, signal, computed } from '@angular/core';

export type LangCode = 'en' | 'es' | 'fr' | 'de' | 'ja';

export interface Translations {
  // Main Menu
  newGame: string;
  continueGame: string;
  settings: string;
  quit: string;
  howToPlay: string;
  credits: string;
  unlocks: string;
  unlockHint: string;
  loadingLabel: string;
  dataError: string;
  retry: string;
  // Character Select
  chooseCharacter: string;
  characterSubtitle: string;
  back: string;
  select: string;
  hp: string;
  // Settings
  settingsTitle: string;
  close: string;
  audio: string;
  graphics: string;
  language: string;
  display: string;
  music: string;
  effects: string;
  muteAll: string;
  clickSound: string;
  vfxIntensity: string;
  animationSpeed: string;
  textSize: string;
  handLayout: string;
  reducedMotion: string;
  highContrast: string;
  postProcessing: string;
  debugLayout: string;
  fpsCounter: string;
  combatHotkeys: string;
  selectLanguage: string;
  full: string;
  reduced: string;
  off: string;
  slow: string;
  normal: string;
  fast: string;
  small: string;
  large: string;
  compact: string;
  default: string;
  on: string;
  // Confirm Dialog
  confirmNewGame: string;
  confirmNewGameBody: string;
  confirmYes: string;
  confirmNo: string;
  // How to Play
  howToPlayTitle: string;
  htp1Title: string; htp1Body: string;
  htp2Title: string; htp2Body: string;
  htp3Title: string; htp3Body: string;
  htp4Title: string; htp4Body: string;
  htp5Title: string; htp5Body: string;
  htp6Title: string; htp6Body: string;
  // Credits
  creditsTitle: string;
  creditsDev: string;
  creditsArt: string;
  creditsMusic: string;
  creditsEngine: string;
  creditsClose: string;
  // Toast
  gameSaved: string;
  runLoaded: string;
}

const EN: Translations = {
  newGame: 'New Game',
  continueGame: 'Continue',
  settings: 'Settings',
  quit: 'Quit',
  howToPlay: 'How to Play',
  credits: 'Credits',
  unlocks: 'Unlocks',
  unlockHint: 'Reach sector 2 or win a run to unlock more content.',
  loadingLabel: 'Loading…',
  dataError: 'Data failed to load. Check the console for details.',
  retry: 'Retry',
  chooseCharacter: 'Choose Your Character',
  characterSubtitle: 'Each character begins with a unique starter deck.',
  back: '← Back',
  select: 'Select →',
  hp: 'HP',
  settingsTitle: 'Settings',
  close: 'Close',
  audio: 'Audio',
  graphics: 'Graphics',
  language: 'Language',
  display: 'Display',
  music: 'Music',
  effects: 'Effects',
  muteAll: 'Mute all',
  clickSound: 'Click sound',
  vfxIntensity: 'VFX intensity',
  animationSpeed: 'Animation speed',
  textSize: 'Text size',
  handLayout: 'Hand layout',
  reducedMotion: 'Reduced motion',
  highContrast: 'High contrast mode',
  postProcessing: 'Post-processing',
  debugLayout: 'Debug layout overlay (F3)',
  fpsCounter: 'FPS counter',
  combatHotkeys: 'Combat hotkeys',
  selectLanguage: 'Select Language',
  full: 'Full',
  reduced: 'Reduced',
  off: 'Off',
  slow: 'Slow',
  normal: 'Normal',
  fast: 'Fast',
  small: 'Small',
  large: 'Large',
  compact: 'Compact',
  default: 'Default',
  on: 'On',
  confirmNewGame: 'Start New Game?',
  confirmNewGameBody: 'You have an active run in progress. Starting a new game will permanently erase it.',
  confirmYes: 'Yes, Start Over',
  confirmNo: 'Cancel',
  howToPlayTitle: 'How to Play',
  htp1Title: 'Build Your Deck',
  htp1Body: 'After each combat you can add cards to your deck. Mix attacks, blocks, and special abilities to craft a winning strategy.',
  htp2Title: 'Manage Your Energy',
  htp2Body: 'Each turn you get 3 energy. Cards cost energy to play. Spend wisely — leftover energy is lost when your turn ends.',
  htp3Title: 'Understand Your Enemy',
  htp3Body: 'Enemies telegraph their next action with an icon above them. Use that information to decide whether to attack or defend.',
  htp4Title: 'Navigate the Map',
  htp4Body: 'Choose your path through the sector. Fight monsters, visit shops, rest to heal, or discover mysterious events.',
  htp5Title: 'Use Relics',
  htp5Body: 'Relics are passive items that give powerful permanent bonuses. Read them carefully — combos between relics can win runs.',
  htp6Title: 'Survive All Sectors',
  htp6Body: 'Clear all three sectors and defeat the final boss to complete a run. Winning unlocks harder ascension levels.',
  creditsTitle: 'Credits',
  creditsDev: 'Game Design & Engineering',
  creditsArt: 'Art & Visual Design',
  creditsMusic: 'Music & Sound',
  creditsEngine: 'Built with Angular + PixiJS',
  creditsClose: 'Close',
  gameSaved: 'Game saved.',
  runLoaded: 'Run loaded!',
};

const ES: Translations = {
  newGame: 'Nueva Partida',
  continueGame: 'Continuar',
  settings: 'Ajustes',
  quit: 'Salir',
  howToPlay: 'Cómo Jugar',
  credits: 'Créditos',
  unlocks: 'Desbloqueos',
  unlockHint: 'Llega al sector 2 o gana una partida para desbloquear más contenido.',
  loadingLabel: 'Cargando…',
  dataError: 'Error al cargar datos. Revisa la consola.',
  retry: 'Reintentar',
  chooseCharacter: 'Elige tu Personaje',
  characterSubtitle: 'Cada personaje empieza con un mazo inicial único.',
  back: '← Atrás',
  select: 'Elegir →',
  hp: 'VP',
  settingsTitle: 'Ajustes',
  close: 'Cerrar',
  audio: 'Audio',
  graphics: 'Gráficos',
  language: 'Idioma',
  display: 'Pantalla',
  music: 'Música',
  effects: 'Efectos',
  muteAll: 'Silenciar todo',
  clickSound: 'Sonido de clic',
  vfxIntensity: 'Intensidad de VFX',
  animationSpeed: 'Velocidad de animación',
  textSize: 'Tamaño de texto',
  handLayout: 'Disposición de mano',
  reducedMotion: 'Movimiento reducido',
  highContrast: 'Alto contraste',
  postProcessing: 'Postprocesado',
  debugLayout: 'Superposición de depuración (F3)',
  fpsCounter: 'Contador de FPS',
  combatHotkeys: 'Atajos de combate',
  selectLanguage: 'Seleccionar idioma',
  full: 'Completo',
  reduced: 'Reducido',
  off: 'Apagado',
  slow: 'Lento',
  normal: 'Normal',
  fast: 'Rápido',
  small: 'Pequeño',
  large: 'Grande',
  compact: 'Compacto',
  default: 'Por defecto',
  on: 'Activado',
  confirmNewGame: '¿Iniciar nueva partida?',
  confirmNewGameBody: 'Tienes una partida activa. Si comienzas de nuevo, se borrará permanentemente.',
  confirmYes: 'Sí, empezar de nuevo',
  confirmNo: 'Cancelar',
  howToPlayTitle: 'Cómo Jugar',
  htp1Title: 'Construye tu Mazo',
  htp1Body: 'Tras cada combate puedes añadir cartas. Mezcla ataques, bloqueos y habilidades especiales para crear tu estrategia.',
  htp2Title: 'Gestiona tu Energía',
  htp2Body: 'Cada turno recibes 3 de energía. Las cartas cuestan energía. La energía sobrante se pierde al final del turno.',
  htp3Title: 'Entiende al Enemigo',
  htp3Body: 'Los enemigos muestran su próxima acción con un icono. Úsalo para decidir si atacar o defenderte.',
  htp4Title: 'Navega el Mapa',
  htp4Body: 'Elige tu ruta por el sector: lucha, visita tiendas, descansa para curarte o descubre eventos misteriosos.',
  htp5Title: 'Usa Reliquias',
  htp5Body: 'Las reliquias son objetos pasivos con bonificaciones permanentes. Sus combinaciones pueden ganar partidas.',
  htp6Title: 'Supera Todos los Sectores',
  htp6Body: 'Supera los tres sectores y derrota al jefe final para completar una partida. Ganar desbloquea ascensiones.',
  creditsTitle: 'Créditos',
  creditsDev: 'Diseño y Programación',
  creditsArt: 'Arte y Diseño Visual',
  creditsMusic: 'Música y Sonido',
  creditsEngine: 'Hecho con Angular + PixiJS',
  creditsClose: 'Cerrar',
  gameSaved: 'Partida guardada.',
  runLoaded: '¡Partida cargada!',
};

const FR: Translations = {
  newGame: 'Nouvelle Partie',
  continueGame: 'Continuer',
  settings: 'Paramètres',
  quit: 'Quitter',
  howToPlay: 'Comment Jouer',
  credits: 'Crédits',
  unlocks: 'Déblocages',
  unlockHint: 'Atteignez le secteur 2 ou gagnez une partie pour débloquer du contenu.',
  loadingLabel: 'Chargement…',
  dataError: 'Échec du chargement des données. Voir la console.',
  retry: 'Réessayer',
  chooseCharacter: 'Choisissez votre Personnage',
  characterSubtitle: 'Chaque personnage commence avec un deck de départ unique.',
  back: '← Retour',
  select: 'Choisir →',
  hp: 'PV',
  settingsTitle: 'Paramètres',
  close: 'Fermer',
  audio: 'Audio',
  graphics: 'Graphismes',
  language: 'Langue',
  display: 'Affichage',
  music: 'Musique',
  effects: 'Effets',
  muteAll: 'Tout couper',
  clickSound: 'Son de clic',
  vfxIntensity: 'Intensité des VFX',
  animationSpeed: 'Vitesse d\'animation',
  textSize: 'Taille du texte',
  handLayout: 'Disposition de la main',
  reducedMotion: 'Mouvement réduit',
  highContrast: 'Mode contraste élevé',
  postProcessing: 'Post-traitement',
  debugLayout: 'Superposition débogage (F3)',
  fpsCounter: 'Compteur FPS',
  combatHotkeys: 'Raccourcis de combat',
  selectLanguage: 'Choisir la langue',
  full: 'Complet',
  reduced: 'Réduit',
  off: 'Désactivé',
  slow: 'Lent',
  normal: 'Normal',
  fast: 'Rapide',
  small: 'Petit',
  large: 'Grand',
  compact: 'Compact',
  default: 'Défaut',
  on: 'Activé',
  confirmNewGame: 'Nouvelle Partie ?',
  confirmNewGameBody: 'Vous avez une partie en cours. Commencer une nouvelle partie l\'effacera définitivement.',
  confirmYes: 'Oui, recommencer',
  confirmNo: 'Annuler',
  howToPlayTitle: 'Comment Jouer',
  htp1Title: 'Construisez votre Deck',
  htp1Body: 'Après chaque combat, ajoutez des cartes. Mélangez attaques, blocages et capacités spéciales.',
  htp2Title: 'Gérez votre Énergie',
  htp2Body: 'Vous recevez 3 énergie par tour. Les cartes coûtent de l\'énergie. L\'énergie inutilisée est perdue.',
  htp3Title: 'Comprenez l\'Ennemi',
  htp3Body: 'Les ennemis montrent leur prochaine action avec une icône. Utilisez cette information pour attaquer ou vous défendre.',
  htp4Title: 'Naviguez la Carte',
  htp4Body: 'Choisissez votre route : combats, boutiques, repos ou événements mystérieux.',
  htp5Title: 'Utilisez les Reliques',
  htp5Body: 'Les reliques donnent des bonus passifs permanents. Leurs combinaisons peuvent remporter des parties.',
  htp6Title: 'Survivez à Tous les Secteurs',
  htp6Body: 'Terminez les trois secteurs et battez le boss final. Gagner débloque des niveaux d\'ascension.',
  creditsTitle: 'Crédits',
  creditsDev: 'Conception & Développement',
  creditsArt: 'Art & Design Visuel',
  creditsMusic: 'Musique & Son',
  creditsEngine: 'Fait avec Angular + PixiJS',
  creditsClose: 'Fermer',
  gameSaved: 'Partie sauvegardée.',
  runLoaded: 'Partie chargée !',
};

const DE: Translations = {
  newGame: 'Neues Spiel',
  continueGame: 'Fortsetzen',
  settings: 'Einstellungen',
  quit: 'Beenden',
  howToPlay: 'Anleitung',
  credits: 'Mitwirkende',
  unlocks: 'Freischaltungen',
  unlockHint: 'Erreiche Sektor 2 oder gewinne einen Lauf, um Inhalte freizuschalten.',
  loadingLabel: 'Laden…',
  dataError: 'Datenfehler. Konsole prüfen.',
  retry: 'Nochmal',
  chooseCharacter: 'Charakter Wählen',
  characterSubtitle: 'Jeder Charakter beginnt mit einem einzigartigen Startdeck.',
  back: '← Zurück',
  select: 'Auswählen →',
  hp: 'LP',
  settingsTitle: 'Einstellungen',
  close: 'Schließen',
  audio: 'Audio',
  graphics: 'Grafik',
  language: 'Sprache',
  display: 'Anzeige',
  music: 'Musik',
  effects: 'Effekte',
  muteAll: 'Alles stumm',
  clickSound: 'Klickton',
  vfxIntensity: 'VFX-Intensität',
  animationSpeed: 'Animationsgeschwindigkeit',
  textSize: 'Textgröße',
  handLayout: 'Handlayout',
  reducedMotion: 'Reduzierte Bewegung',
  highContrast: 'Hoher Kontrast',
  postProcessing: 'Nachbearbeitung',
  debugLayout: 'Debug-Overlay (F3)',
  fpsCounter: 'FPS-Anzeige',
  combatHotkeys: 'Kampftasten',
  selectLanguage: 'Sprache wählen',
  full: 'Voll',
  reduced: 'Reduziert',
  off: 'Aus',
  slow: 'Langsam',
  normal: 'Normal',
  fast: 'Schnell',
  small: 'Klein',
  large: 'Groß',
  compact: 'Kompakt',
  default: 'Standard',
  on: 'An',
  confirmNewGame: 'Neues Spiel starten?',
  confirmNewGameBody: 'Du hast einen laufenden Spieldurchgang. Ein neues Spiel löscht ihn dauerhaft.',
  confirmYes: 'Ja, neu starten',
  confirmNo: 'Abbrechen',
  howToPlayTitle: 'Anleitung',
  htp1Title: 'Deck aufbauen',
  htp1Body: 'Nach jedem Kampf kannst du Karten hinzufügen. Kombiniere Angriff, Verteidigung und Spezialfähigkeiten.',
  htp2Title: 'Energie verwalten',
  htp2Body: 'Du erhältst 3 Energie pro Zug. Karten kosten Energie. Nicht verbrauchte Energie geht verloren.',
  htp3Title: 'Feinde verstehen',
  htp3Body: 'Feinde zeigen ihre nächste Aktion mit einem Symbol. Nutze das, um anzugreifen oder zu verteidigen.',
  htp4Title: 'Die Karte erkunden',
  htp4Body: 'Wähle deinen Weg durch den Sektor: Kämpfe, Läden, Ruhe oder mysteriöse Ereignisse.',
  htp5Title: 'Relikte nutzen',
  htp5Body: 'Relikte sind passive Gegenstände mit dauerhaften Boni. Kombinationen können Läufe entscheiden.',
  htp6Title: 'Alle Sektoren überleben',
  htp6Body: 'Bezwinge alle drei Sektoren und den Endboss. Ein Sieg schaltet Aufstiegslevel frei.',
  creditsTitle: 'Mitwirkende',
  creditsDev: 'Design & Entwicklung',
  creditsArt: 'Kunst & Visualgestaltung',
  creditsMusic: 'Musik & Sound',
  creditsEngine: 'Entwickelt mit Angular + PixiJS',
  creditsClose: 'Schließen',
  gameSaved: 'Spiel gespeichert.',
  runLoaded: 'Lauf geladen!',
};

const JA: Translations = {
  newGame: '新しいゲーム',
  continueGame: '続ける',
  settings: '設定',
  quit: '終了',
  howToPlay: '遊び方',
  credits: 'クレジット',
  unlocks: 'アンロック',
  unlockHint: 'セクター2到達または勝利でコンテンツをアンロック。',
  loadingLabel: '読み込み中…',
  dataError: 'データの読み込みに失敗。コンソールを確認してください。',
  retry: '再試行',
  chooseCharacter: 'キャラクターを選択',
  characterSubtitle: '各キャラクターは固有のスターターデッキを持ちます。',
  back: '← 戻る',
  select: '選択 →',
  hp: 'HP',
  settingsTitle: '設定',
  close: '閉じる',
  audio: 'オーディオ',
  graphics: 'グラフィック',
  language: '言語',
  display: 'ディスプレイ',
  music: '音楽',
  effects: '効果音',
  muteAll: 'ミュート',
  clickSound: 'クリック音',
  vfxIntensity: 'VFX 強度',
  animationSpeed: 'アニメーション速度',
  textSize: 'テキストサイズ',
  handLayout: '手札レイアウト',
  reducedMotion: 'モーション軽減',
  highContrast: 'ハイコントラスト',
  postProcessing: 'ポストプロセス',
  debugLayout: 'デバッグオーバーレイ (F3)',
  fpsCounter: 'FPS表示',
  combatHotkeys: '戦闘ホットキー',
  selectLanguage: '言語を選択',
  full: '最大',
  reduced: '低減',
  off: 'オフ',
  slow: 'ゆっくり',
  normal: '普通',
  fast: '速い',
  small: '小',
  large: '大',
  compact: 'コンパクト',
  default: 'デフォルト',
  on: 'オン',
  confirmNewGame: '新しいゲームを開始しますか？',
  confirmNewGameBody: 'プレイ中のランがあります。新しいゲームを開始すると、ランは完全に削除されます。',
  confirmYes: 'はい、やり直す',
  confirmNo: 'キャンセル',
  howToPlayTitle: '遊び方',
  htp1Title: 'デッキを構築する',
  htp1Body: '各戦闘後にカードを追加できます。攻撃・防御・特殊能力を組み合わせて戦略を作ろう。',
  htp2Title: 'エネルギーを管理する',
  htp2Body: 'ターン開始時に3エネルギーを得ます。カードのプレイにはエネルギーが必要です。余ったエネルギーは失われます。',
  htp3Title: '敵を理解する',
  htp3Body: '敵はアイコンで次の行動を示します。攻撃か防御かを判断するのに使いましょう。',
  htp4Title: 'マップを探索する',
  htp4Body: 'セクター内で経路を選択：戦闘、ショップ、休憩、謎のイベントなど。',
  htp5Title: 'レリックを活用する',
  htp5Body: 'レリックは強力な永続ボーナスを持つパッシブアイテム。組み合わせがランの勝敗を左右します。',
  htp6Title: '全セクターを生き残る',
  htp6Body: '3つのセクターをクリアし、ラスボスを倒せば完走です。勝利すると上位難易度が解放されます。',
  creditsTitle: 'クレジット',
  creditsDev: 'ゲームデザイン & 開発',
  creditsArt: 'アート & ビジュアルデザイン',
  creditsMusic: '音楽 & サウンド',
  creditsEngine: 'Angular + PixiJS 製',
  creditsClose: '閉じる',
  gameSaved: 'ゲームが保存されました。',
  runLoaded: 'ランを読み込みました！',
};

const TRANSLATIONS: Record<string, Translations> = { en: EN, es: ES, fr: FR, de: DE, ja: JA };

export interface LanguageMeta {
  code: LangCode;
  label: string;
  nativeLabel: string;
  flag: string;
}

export const LANGUAGES: LanguageMeta[] = [
  { code: 'en', label: 'English',  nativeLabel: 'English',  flag: '🇬🇧' },
  { code: 'es', label: 'Spanish',  nativeLabel: 'Español',  flag: '🇪🇸' },
  { code: 'fr', label: 'French',   nativeLabel: 'Français', flag: '🇫🇷' },
  { code: 'de', label: 'German',   nativeLabel: 'Deutsch',  flag: '🇩🇪' },
  { code: 'ja', label: 'Japanese', nativeLabel: '日本語',    flag: '🇯🇵' },
];

const LANG_STORAGE_KEY = 'game-language';

function detectBrowserLanguage(): LangCode {
  if (typeof navigator === 'undefined') return 'en';
  const nav = navigator.language?.toLowerCase() ?? '';
  if (nav.startsWith('es')) return 'es';
  if (nav.startsWith('fr')) return 'fr';
  if (nav.startsWith('de')) return 'de';
  if (nav.startsWith('ja')) return 'ja';
  return 'en';
}

@Injectable({ providedIn: 'root' })
export class LanguageService {
  readonly languages = LANGUAGES;

  readonly currentLang = signal<LangCode>(this.loadLang());

  readonly t = computed<Translations>(() => {
    const lang = this.currentLang();
    return TRANSLATIONS[lang] ?? EN;
  });

  setLanguage(code: LangCode): void {
    this.currentLang.set(code);
    try { localStorage.setItem(LANG_STORAGE_KEY, code); } catch {}
  }

  private loadLang(): LangCode {
    try {
      const stored = localStorage.getItem(LANG_STORAGE_KEY) as LangCode | null;
      if (stored && TRANSLATIONS[stored]) return stored;
    } catch {}
    return detectBrowserLanguage();
  }
}
