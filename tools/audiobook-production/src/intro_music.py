"""Keep the opening music gradual, and finish it before the first prose paragraph."""


def intro_music_profile(scenes, lead=4.0):
    """Return the music duration and gain points for an assembled timeline.

    Opening cards use the original 5.5-second fade heard in episodes 3–5.
    A prologue that starts directly with prose keeps its existing short opening.
    The duplicated scene at zero is the music-only lead, not spoken prose.
    """
    body_start = next((start for start, _, _, mode, _ in scenes
                       if mode == "caption" and start >= lead), lead)
    if body_start <= lead:
        return lead, [(0.0, 0.0), (0.8, 1.0), (lead - 1.5, 1.0), (lead - 0.5, 0.0)]
    fade_end = min(lead + 5.0, body_start - 0.5)
    fade_start = min(lead - 0.5, fade_end - 0.8)
    return fade_end, [(0.0, 0.0), (0.8, 1.0), (fade_start, 1.0), (fade_end, 0.0)]
