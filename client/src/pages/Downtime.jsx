import React from "react";
import downtimeImage from "../assets/DowntimeImage.png";

export default function Downtime({ title, message, detail, onRetry }) {
  return (
    <div className="downtime">
      <div className="downtime__card">
        <div className="downtime__image-wrap">
          <img src={downtimeImage} alt="Service unavailable" className="downtime__image" />
        </div>
        <div className="downtime__content">
          <p className="pill pill--warn">Temporary downtime</p>
          <h1>{title}</h1>
          <p className="downtime__message">{message}</p>
          {detail ? <p className="downtime__detail">{detail}</p> : null}
          <div className="downtime__actions">
            <button className="btn btn--primary" onClick={onRetry}>
              Try again
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
