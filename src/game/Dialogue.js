/**
 * Conversation runner.
 *
 * Walks a DIALOGUE topic tree, speaking each line through the NPC's own voice
 * so the face, gestures and mood all follow the text. Choices can accept or
 * complete quests, shift the speaker's disposition, or branch to another topic.
 */
export class DialogueRunner {
  constructor({ dialogue, ui, journal, inventory }) {
    this.topics = dialogue;
    this.ui = ui;
    this.journal = journal;
    this.inventory = inventory;
    this.active = null;
    this.npc = null;
  }

  get running() { return !!this.active; }

  /**
   * Cut the current line short. Nobody wants to sit through a voice line they
   * have already read, and without this a long speech is unskippable.
   */
  skip() {
    const s = this.npc?.char?._skip;
    if (s) { s(); return true; }
    return false;
  }

  async start(npc, topicId) {
    const topic = this.topics[topicId];
    if (!topic) { console.warn(`missing dialogue topic: ${topicId}`); return; }

    this.npc = npc;
    this.active = topicId;
    npc.state = 'talk';

    await npc.char.enableFace();
    this.ui.openDialogue(npc.name);
    this.ui.onDialogueChoice = (i) => this._choose(i);

    await this._playTopic(topic);
  }

  async _playTopic(topic) {
    const npc = this.npc;
    this.ui.setDialogueOptions([]);            // hide options while speaking

    // Warm every line of this topic at once: pre-generated clips are a cheap
    // fetch, and unvoiced lines start synthesising in the worker NOW, so by
    // the time the conversation reaches them the audio is already cached.
    import('../character/VoiceBank.js').then(({ voiceClip }) => {
      for (const line of topic.lines ?? []) voiceClip(npc.def?.id, line.text).catch(() => {});
    }).catch(() => {});

    for (const line of topic.lines ?? []) {
      if (!this.active) return;                // player bailed mid-line
      this.ui.setDialogueLine(line.text);
      npc.char.animator.mood = line.mood ?? npc.char.disposition ?? 0;
      await npc.char.say(line.text, { mood: line.mood });
    }
    if (!this.active) return;

    const options = (topic.options ?? []).filter((o) => this._available(o));
    if (!options.length) { this.end(); return; }

    this._options = options;
    this.ui.setDialogueOptions(options);
  }

  /** Hide options whose prerequisites aren't met. */
  _available(opt) {
    if (opt.requires?.quest && !this.journal.isActive(opt.requires.quest)
        && !this.journal.isComplete(opt.requires.quest)) return false;
    if (opt.requires?.completed && !this.journal.isComplete(opt.requires.completed)) return false;
    if (opt.requires?.item && !this.inventory.has(opt.requires.item, opt.requires.qty ?? 1)) return false;
    if (opt.hideIfActive && this.journal.isActive(opt.hideIfActive)) return false;
    return true;
  }

  async _choose(index) {
    const opt = this._options?.[index];
    if (!opt || !this.active) return;
    this._options = null;

    if (opt.accept) {
      if (this.journal.start(opt.accept)) {
        const q = this.journal.defs.get(opt.accept);
        this.ui.toast('Quest started', q?.name ?? opt.accept);
      }
    }
    if (opt.complete) this.journal.complete(opt.complete);
    if (opt.give) for (const g of [].concat(opt.give)) this.inventory.add(g.item ?? g, g.qty ?? 1);
    if (opt.take) for (const g of [].concat(opt.take)) this.inventory.remove(g.item ?? g, g.qty ?? 1);
    if (opt.disposition !== undefined && this.npc) {
      this.npc.char.disposition = Math.max(-1, Math.min(1, (this.npc.char.disposition ?? 0) + opt.disposition));
    }

    // Talking to someone counts toward 'talk' objectives.
    this.journal.notify('talk', this.npc.id);

    if (opt.exit || !opt.goto) { this.end(); return; }

    const next = this.topics[opt.goto];
    if (!next) { this.end(); return; }
    this.active = opt.goto;
    await this._playTopic(next);
  }

  end() {
    if (this.npc) {
      this.npc.char.animator.speaking = false;
      this.npc.state = 'idle';
      // Keep the face attached briefly — an immediate detach mid-blink pops.
      const npc = this.npc;
      setTimeout(() => { if (npc.state !== 'talk') npc.char.disableFace(); }, 1500);
    }
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    this.active = null;
    this.npc = null;
    this._options = null;
    this.ui.closeDialogue();
  }
}
