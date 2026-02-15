import React, { useMemo } from "react";
import defaultPlayer from "../assets/default-player.svg";
import { countryFlag } from "../utils/flags.js";

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

const PlayerChip = ({
  player,
  isCaptain,
  isViceCaptain,
  isCaptainX3,
  canEdit,
  onRemove,
  pointsByName,
  onSelect,
  selectable
}) => {
  const key = String(player.name || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const points = pointsByName?.get ? pointsByName.get(key) : null;
  return (
  <div
    className={`player-chip ${selectable ? "player-chip--selectable" : ""}`}
    role={selectable ? "button" : undefined}
    tabIndex={selectable ? 0 : undefined}
    onClick={selectable ? () => onSelect?.(player) : undefined}
    onKeyDown={
      selectable
        ? (e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onSelect?.(player);
            }
          }
        : undefined
    }
  >
    <div className="player-chip__avatar">
      <img
        src={player.playerImg || defaultPlayer}
        alt={player.name || "Player"}
        loading="lazy"
      />
    </div>
    {isCaptainX3 && <span className="badge badge--captainx3">C x3</span>}
    {(isCaptain || isViceCaptain) && (
      <span className={`badge ${isCaptain ? "badge--captain" : "badge--vc"}`}>
        {isCaptain ? "C" : "V/C"}
      </span>
    )}
    <div className="player-chip__name">{player.name}</div>
    {(() => {
      const flag = countryFlag(player.country || player.team);
      return (
        <div className="player-chip__flag">
          {flag.type === "img" ? <img src={flag.value} alt={`${player.country || "Country"} flag`} /> : flag.value}
        </div>
      );
    })()}
    <div className="player-chip__price">£{formatPrice(player.price)}m</div>
    {points != null ? <div className="player-chip__points">Pts {points}</div> : null}
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
};

export default function SelectedTeamField({
  players = [],
  captainId = "",
  viceCaptainId = "",
  captainX3PlayerId = "",
  showCaptainX3Prompt = false,
  onCaptainX3Pick,
  canEdit = false,
  onRemove,
  pointsByName
}) {
  const buckets = useMemo(() => roleBuckets(players), [players]);

  return (
    <section className="team-field">
      {showCaptainX3Prompt && (
        <div className="team-field__prompt" aria-live="polite">
          <span className="team-field__prompt-icon">🖱️</span>
          <span>Pick CAPTAIN X3 from your XI</span>
        </div>
      )}
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
                isCaptainX3={String(player._id) === String(captainX3PlayerId)}
                selectable={Boolean(showCaptainX3Prompt)}
                onSelect={onCaptainX3Pick}
                canEdit={canEdit}
                onRemove={onRemove}
                pointsByName={pointsByName}
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
                isCaptainX3={String(player._id) === String(captainX3PlayerId)}
                selectable={Boolean(showCaptainX3Prompt)}
                onSelect={onCaptainX3Pick}
                canEdit={canEdit}
                onRemove={onRemove}
                pointsByName={pointsByName}
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
                isCaptainX3={String(player._id) === String(captainX3PlayerId)}
                selectable={Boolean(showCaptainX3Prompt)}
                onSelect={onCaptainX3Pick}
                canEdit={canEdit}
                onRemove={onRemove}
                pointsByName={pointsByName}
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
                isCaptainX3={String(player._id) === String(captainX3PlayerId)}
                selectable={Boolean(showCaptainX3Prompt)}
                onSelect={onCaptainX3Pick}
                canEdit={canEdit}
                onRemove={onRemove}
                pointsByName={pointsByName}
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
