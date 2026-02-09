import React, { useMemo } from "react";

const roleBuckets = (players = []) => {
  const buckets = {
    wicketKeepers: [],
    batsmen: [],
    allRounders: [],
    bowlers: []
  };

  players.forEach((player) => {
    const role = String(player.role || "").toLowerCase();
    if (role.includes("wk") || role.includes("keeper")) {
      buckets.wicketKeepers.push(player);
    } else if (role.includes("all")) {
      buckets.allRounders.push(player);
    } else if (role.includes("bowl")) {
      buckets.bowlers.push(player);
    } else {
      buckets.batsmen.push(player);
    }
  });

  return buckets;
};

const initials = (name = "") =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

const formatPrice = (value) => Number(value || 0).toFixed(1);

const PlayerChip = ({ player, isCaptain, isViceCaptain, canEdit, onRemove }) => (
  <div className="player-chip">
    <div className="player-chip__avatar">
      {initials(player.name)}
      {(isCaptain || isViceCaptain) && (
        <span className={`badge ${isCaptain ? "badge--captain" : "badge--vc"}`}>
          {isCaptain ? "C" : "V/C"}
        </span>
      )}
    </div>
    <div className="player-chip__meta">
      <div className="player-chip__name">{player.name}</div>
      <div className="player-chip__details">
        <span className="player-chip__country">{player.country || "—"}</span>
        <span className="player-chip__price">{formatPrice(player.price)} Cr</span>
      </div>
    </div>
    {canEdit && (
      <button
        type="button"
        className="chip-remove"
        onClick={() => onRemove?.(player._id)}
        aria-label={`Remove ${player.name}`}
        title="Remove player"
      >
        ×
      </button>
    )}
  </div>
);

export default function SelectedTeamField({
  players = [],
  captainId = "",
  viceCaptainId = "",
  canEdit = false,
  onRemove
}) {
  const buckets = useMemo(() => roleBuckets(players), [players]);

  return (
    <section className="team-field">
      <div className="field-section">
        <div className="field-section__title">WICKET-KEEPERS</div>
        <div className="field-section__grid field-section__grid--wk">
          {buckets.wicketKeepers.length ? (
            buckets.wicketKeepers.map((player) => (
              <PlayerChip
                key={player._id || player.name}
                player={player}
                isCaptain={String(player._id) === String(captainId)}
                isViceCaptain={String(player._id) === String(viceCaptainId)}
                canEdit={canEdit}
                onRemove={onRemove}
              />
            ))
          ) : (
            <div className="field-section__empty">No wicket-keepers selected</div>
          )}
        </div>
      </div>

      <div className="field-section">
        <div className="field-section__title">BATSMEN</div>
        <div className="field-section__grid field-section__grid--bat">
          {buckets.batsmen.length ? (
            buckets.batsmen.map((player) => (
              <PlayerChip
                key={player._id || player.name}
                player={player}
                isCaptain={String(player._id) === String(captainId)}
                isViceCaptain={String(player._id) === String(viceCaptainId)}
                canEdit={canEdit}
                onRemove={onRemove}
              />
            ))
          ) : (
            <div className="field-section__empty">No batsmen selected</div>
          )}
        </div>
      </div>

      <div className="field-section">
        <div className="field-section__title">ALL-ROUNDERS</div>
        <div className="field-section__grid field-section__grid--ar">
          {buckets.allRounders.length ? (
            buckets.allRounders.map((player) => (
              <PlayerChip
                key={player._id || player.name}
                player={player}
                isCaptain={String(player._id) === String(captainId)}
                isViceCaptain={String(player._id) === String(viceCaptainId)}
                canEdit={canEdit}
                onRemove={onRemove}
              />
            ))
          ) : (
            <div className="field-section__empty">No all-rounders selected</div>
          )}
        </div>
      </div>

      <div className="field-section">
        <div className="field-section__title">BOWLERS</div>
        <div className="field-section__grid field-section__grid--bowl">
          {buckets.bowlers.length ? (
            buckets.bowlers.map((player) => (
              <PlayerChip
                key={player._id || player.name}
                player={player}
                isCaptain={String(player._id) === String(captainId)}
                isViceCaptain={String(player._id) === String(viceCaptainId)}
                canEdit={canEdit}
                onRemove={onRemove}
              />
            ))
          ) : (
            <div className="field-section__empty">No bowlers selected</div>
          )}
        </div>
      </div>
    </section>
  );
}
